import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LeadActivityType, Role } from '@prisma/client';
import { EmailService } from '../email/email.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class LeadSlaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LeadSlaService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly email: EmailService,
  ) {}

  onModuleInit() {
    if (this.config.get<string>('LEAD_SLA_ENABLED')?.toLowerCase() !== 'true') {
      this.logger.log('Unassigned-lead SLA automation is disabled');
      return;
    }
    const intervalMinutes = this.positiveMinutes(
      'LEAD_SLA_CHECK_INTERVAL_MINUTES',
      5,
    );
    this.timer = setInterval(
      () => void this.process().catch((error) => this.logFailure(error)),
      intervalMinutes * 60_000,
    );
    this.timer.unref();
    void this.process().catch((error) => this.logFailure(error));
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async process() {
    if (this.running) return;
    this.running = true;
    try {
      const reminderMinutes = this.positiveMinutes(
        'LEAD_SLA_REMINDER_MINUTES',
        15,
      );
      const assignmentMinutes = Math.max(
        this.positiveMinutes('LEAD_SLA_ASSIGN_MINUTES', 30),
        reminderMinutes,
      );
      const now = new Date();
      const reminderCutoff = new Date(
        now.getTime() - reminderMinutes * 60_000,
      );
      const assignmentCutoff = new Date(
        now.getTime() - assignmentMinutes * 60_000,
      );
      const adminEmails = await this.activeAdminEmails();

      await this.sendReminders(reminderCutoff, adminEmails);
      await this.assignOrEscalate(assignmentCutoff, adminEmails);
    } finally {
      this.running = false;
    }
  }

  private async sendReminders(cutoff: Date, adminEmails: string[]) {
    const leads = await this.prisma.lead.findMany({
      where: {
        assignedToId: null,
        archivedAt: null,
        unassignedAt: { lte: cutoff },
        slaReminderSentAt: null,
      },
      orderBy: { unassignedAt: 'asc' },
      take: 100,
    });

    for (const lead of leads) {
      const claimed = await this.prisma.lead.updateMany({
        where: {
          id: lead.id,
          assignedToId: null,
          archivedAt: null,
          slaReminderSentAt: null,
        },
        data: { slaReminderSentAt: new Date() },
      });
      if (!claimed.count) continue;
      await this.prisma.leadActivity.create({
        data: {
          leadId: lead.id,
          type: LeadActivityType.SLA_REMINDER_SENT,
          details: { unassignedAt: lead.unassignedAt?.toISOString() ?? null },
        },
      });
      await this.emailAdmins(
        adminEmails,
        `Unassigned lead reminder: ${lead.fullName}`,
        `<p>The lead <strong>${this.escape(lead.fullName)}</strong> is still unassigned.</p>${this.leadLink(lead.id)}`,
      );
    }
  }

  private async assignOrEscalate(cutoff: Date, adminEmails: string[]) {
    const leads = await this.prisma.lead.findMany({
      where: {
        assignedToId: null,
        archivedAt: null,
        unassignedAt: { lte: cutoff },
        slaEscalatedAt: null,
      },
      orderBy: { unassignedAt: 'asc' },
      take: 100,
    });
    if (!leads.length) return;

    const salesUsers = await this.prisma.user.findMany({
      where: { role: Role.SALES, isActive: true },
      select: { id: true, name: true, email: true },
      orderBy: { id: 'asc' },
    });
    if (!salesUsers.length) {
      for (const lead of leads) {
        const marked = await this.markEscalated(lead.id, cutoff);
        if (!marked) continue;
        await this.emailAdmins(
          adminEmails,
          `Lead SLA escalation: ${lead.fullName}`,
          `<p>The lead <strong>${this.escape(lead.fullName)}</strong> could not be auto-assigned because no active salesperson is available.</p>${this.leadLink(lead.id)}`,
        );
      }
      return;
    }

    const grouped = await this.prisma.lead.groupBy({
      by: ['assignedToId'],
      where: {
        assignedToId: { in: salesUsers.map((user) => user.id) },
        archivedAt: null,
      },
      _count: { _all: true },
    });
    const load = new Map(
      grouped.map((row) => [row.assignedToId, row._count._all]),
    );

    for (const lead of leads) {
      const assignee = [...salesUsers].sort(
        (a, b) =>
          (load.get(a.id) ?? 0) - (load.get(b.id) ?? 0) ||
          a.id.localeCompare(b.id),
      )[0];
      const assigned = await this.prisma.$transaction(async (tx) => {
        const claimed = await tx.lead.updateMany({
          where: {
            id: lead.id,
            assignedToId: null,
            archivedAt: null,
            unassignedAt: { lte: cutoff },
            slaEscalatedAt: null,
          },
          data: {
            assignedToId: assignee.id,
            unassignedAt: null,
            slaEscalatedAt: new Date(),
          },
        });
        if (!claimed.count) return null;
        await tx.leadActivity.create({
          data: {
            leadId: lead.id,
            type: LeadActivityType.AUTO_ASSIGNED,
            details: { assignedToId: assignee.id },
          },
        });
        return tx.lead.findUnique({ where: { id: lead.id } });
      });
      if (!assigned) continue;
      load.set(assignee.id, (load.get(assignee.id) ?? 0) + 1);
      await this.email.sendLeadAssignmentEmail({
        leadId: assigned.id,
        salespersonEmail: assignee.email,
        salespersonName: assignee.name,
        leadName: assigned.fullName,
        company: assigned.company,
      });
    }
  }

  private async markEscalated(leadId: string, cutoff: Date) {
    return this.prisma.$transaction(async (tx) => {
      const marked = await tx.lead.updateMany({
        where: {
          id: leadId,
          assignedToId: null,
          archivedAt: null,
          unassignedAt: { lte: cutoff },
          slaEscalatedAt: null,
        },
        data: { slaEscalatedAt: new Date() },
      });
      if (!marked.count) return false;
      await tx.leadActivity.create({
        data: { leadId, type: LeadActivityType.SLA_ESCALATED },
      });
      return true;
    });
  }

  private activeAdminEmails() {
    return this.prisma.user
      .findMany({
        where: {
          role: { in: [Role.SUPER_ADMIN, Role.ADMIN] },
          isActive: true,
        },
        select: { email: true },
      })
      .then((users) => users.map((user) => user.email));
  }

  private async emailAdmins(to: string[], subject: string, body: string) {
    await Promise.allSettled(
      to.map((email) => this.email.sendSystemEmail(email, subject, body)),
    );
  }

  private leadLink(leadId: string) {
    const frontendUrl =
      this.config.get<string>('FRONTEND_URL') || 'http://localhost:3000';
    const url = `${frontendUrl}/leads/${leadId}`;
    return `<p><a href="${this.escape(url)}">Open lead in LMS</a></p>`;
  }

  private positiveMinutes(key: string, fallback: number) {
    const value = Number(this.config.get<string>(key) ?? fallback);
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }

  private escape(value: string) {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  private logFailure(error: unknown) {
    this.logger.error(
      `Unassigned-lead SLA processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
}
