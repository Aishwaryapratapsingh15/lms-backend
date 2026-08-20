import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  LeadActivityType,
  LeadPriority,
  LeadSource,
  LeadStatus,
  Prisma,
  Role,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DashboardQueryDto } from './dto/dashboard-query.dto';
import { ListLeadsQueryDto } from './dto/list-leads-query.dto';
import { RemindersQueryDto } from './dto/reminders-query.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';

type Actor = { id: string; role: Role };

const leadRelations = {
  assignedTo: { select: { id: true, name: true, email: true, role: true } },
  createdBy: { select: { id: true, name: true, email: true, role: true } },
} satisfies Prisma.LeadInclude;

@Injectable()
export class LeadsService {
  constructor(private readonly prisma: PrismaService) {}

  private accessScope(actor: Actor): Prisma.LeadWhereInput {
    return actor.role === Role.SALES ? { assignedToId: actor.id } : {};
  }

  private async accessibleLead(id: string, actor: Actor) {
    const lead = await this.prisma.lead.findFirst({
      where: { id, ...this.accessScope(actor) },
    });
    if (!lead) throw new NotFoundException('Lead not found');
    return lead;
  }

  private assertActiveLead(lead: { archivedAt: Date | null }) {
    if (lead.archivedAt)
      throw new BadRequestException(
        'Archived leads must be restored before editing',
      );
  }

  private activity(
    leadId: string,
    actorId: string,
    type: LeadActivityType,
    details?: Prisma.InputJsonValue,
  ): Prisma.LeadActivityCreateArgs['data'] {
    return { leadId, actorId, type, details };
  }

  async createLead(
    data: {
      fullName: string;
      email?: string;
      phone?: string;
      company?: string;
      source?: LeadSource;
      status?: LeadStatus;
      priority?: LeadPriority;
      notes?: string;
      assignedToId?: string;
    },
    actor: Actor,
  ) {
    const duplicateConditions: Prisma.LeadWhereInput[] = [];
    if (data.email)
      duplicateConditions.push({
        email: { equals: data.email, mode: 'insensitive' },
      });
    if (data.phone) duplicateConditions.push({ phone: data.phone });
    if (duplicateConditions.length) {
      const duplicate = await this.prisma.lead.findFirst({
        where: { archivedAt: null, OR: duplicateConditions },
        select: { id: true, fullName: true, email: true, phone: true },
      });
      if (duplicate) {
        throw new ConflictException({
          message: 'A lead with this email or phone already exists',
          duplicate,
        });
      }
    }

    if (data.assignedToId) await this.assertActiveSalesUser(data.assignedToId);

    return this.prisma.$transaction(async (tx) => {
      const lead = await tx.lead.create({
        data: {
          ...data,
          source: data.source ?? LeadSource.WEBSITE,
          status: data.status ?? LeadStatus.NEW,
          priority: data.priority ?? LeadPriority.MEDIUM,
          createdById: actor.id,
        },
        include: leadRelations,
      });
      await tx.leadActivity.create({
        data: this.activity(lead.id, actor.id, LeadActivityType.CREATED, {
          status: lead.status,
          assignedToId: lead.assignedToId,
        }),
      });
      return lead;
    });
  }

  async findAll(query: ListLeadsQueryDto, actor: Actor) {
    const filters: Prisma.LeadWhereInput[] = [this.accessScope(actor)];
    if (query.search) {
      filters.push({
        OR: ['fullName', 'email', 'phone', 'company'].map((field) => ({
          [field]: { contains: query.search, mode: 'insensitive' },
        })) as Prisma.LeadWhereInput[],
      });
    }
    if (query.status) filters.push({ status: query.status });
    if (query.source) filters.push({ source: query.source });
    if (query.priority) filters.push({ priority: query.priority });
    if (query.assignedToId && actor.role !== Role.SALES)
      filters.push({ assignedToId: query.assignedToId });
    if (query.archived === 'active') filters.push({ archivedAt: null });
    if (query.archived === 'archived')
      filters.push({ archivedAt: { not: null } });
    if (query.createdFrom || query.createdTo) {
      filters.push({
        createdAt: {
          gte: query.createdFrom ? new Date(query.createdFrom) : undefined,
          lte: query.createdTo ? new Date(query.createdTo) : undefined,
        },
      });
    }

    const where: Prisma.LeadWhereInput = { AND: filters };
    const skip = (query.page - 1) * query.limit;
    const [data, total] = await this.prisma.$transaction([
      this.prisma.lead.findMany({
        where,
        include: leadRelations,
        orderBy: { createdAt: 'desc' },
        skip,
        take: query.limit,
      }),
      this.prisma.lead.count({ where }),
    ]);

    return {
      data,
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        pages: Math.ceil(total / query.limit),
      },
    };
  }

  async findOne(id: string, actor: Actor) {
    await this.accessibleLead(id, actor);
    return this.prisma.lead.findUnique({
      where: { id },
      include: {
        ...leadRelations,
        followUps: {
          orderBy: { createdAt: 'desc' },
          include: { user: { select: { id: true, name: true, email: true } } },
        },
        emailLogs: { orderBy: { createdAt: 'desc' } },
      },
    });
  }

  async updateLead(id: string, data: UpdateLeadDto, actor: Actor) {
    const current = await this.accessibleLead(id, actor);
    this.assertActiveLead(current);
    const duplicateConditions: Prisma.LeadWhereInput[] = [];
    if (data.email)
      duplicateConditions.push({
        email: { equals: data.email, mode: 'insensitive' },
      });
    if (data.phone) duplicateConditions.push({ phone: data.phone });
    if (duplicateConditions.length) {
      const duplicate = await this.prisma.lead.findFirst({
        where: { id: { not: id }, archivedAt: null, OR: duplicateConditions },
        select: { id: true, fullName: true, email: true, phone: true },
      });
      if (duplicate) {
        throw new ConflictException({
          message: 'A lead with this email or phone already exists',
          duplicate,
        });
      }
    }
    return this.prisma.$transaction(async (tx) => {
      const lead = await tx.lead.update({
        where: { id },
        data,
        include: leadRelations,
      });
      await tx.leadActivity.create({
        data: this.activity(id, actor.id, LeadActivityType.UPDATED, {
          before: {
            fullName: current.fullName,
            email: current.email,
            phone: current.phone,
            company: current.company,
            source: current.source,
            priority: current.priority,
            notes: current.notes,
          },
          changes: { ...data } as Prisma.InputJsonObject,
        }),
      });
      return lead;
    });
  }

  async assignLead(leadId: string, salesId: string, actor: Actor) {
    const lead = await this.accessibleLead(leadId, actor);
    this.assertActiveLead(lead);
    await this.assertActiveSalesUser(salesId);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.lead.update({
        where: { id: leadId },
        data: { assignedToId: salesId },
        include: leadRelations,
      });
      await tx.leadActivity.create({
        data: this.activity(leadId, actor.id, LeadActivityType.ASSIGNED, {
          previousAssignedToId: lead.assignedToId,
          assignedToId: salesId,
        }),
      });
      return updated;
    });
  }

  async updateStatus(leadId: string, status: LeadStatus, actor: Actor) {
    const lead = await this.accessibleLead(leadId, actor);
    this.assertActiveLead(lead);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.lead.update({
        where: { id: leadId },
        data: { status },
      });
      await tx.leadActivity.create({
        data: this.activity(leadId, actor.id, LeadActivityType.STATUS_CHANGED, {
          previousStatus: lead.status,
          status,
        }),
      });
      return updated;
    });
  }

  async addFollowUp(
    data: {
      leadId: string;
      type: 'CALL' | 'EMAIL' | 'MEETING' | 'NOTE';
      notes: string;
      nextFollowUpAt?: string;
    },
    actor: Actor,
  ) {
    const lead = await this.accessibleLead(data.leadId, actor);
    this.assertActiveLead(lead);
    return this.prisma.$transaction(async (tx) => {
      const followUp = await tx.leadFollowUp.create({
        data: {
          ...data,
          userId: actor.id,
          nextFollowUpAt: data.nextFollowUpAt
            ? new Date(data.nextFollowUpAt)
            : undefined,
        },
        include: { user: { select: { id: true, name: true, email: true } } },
      });
      if (followUp.nextFollowUpAt) {
        await tx.lead.update({
          where: { id: data.leadId },
          data: { nextFollowUpAt: followUp.nextFollowUpAt },
        });
      }
      await tx.leadActivity.create({
        data: this.activity(
          data.leadId,
          actor.id,
          LeadActivityType.FOLLOW_UP_ADDED,
          {
            followUpId: followUp.id,
            type: followUp.type,
            nextFollowUpAt: followUp.nextFollowUpAt?.toISOString() ?? null,
          },
        ),
      });
      return followUp;
    });
  }

  async completeFollowUp(id: string, actor: Actor) {
    const followUp = await this.prisma.leadFollowUp.findUnique({
      where: { id },
    });
    if (!followUp) throw new NotFoundException('Follow-up not found');
    await this.accessibleLead(followUp.leadId, actor);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.leadFollowUp.update({
        where: { id },
        data: { completedAt: new Date() },
      });
      await tx.leadActivity.create({
        data: this.activity(
          followUp.leadId,
          actor.id,
          LeadActivityType.FOLLOW_UP_COMPLETED,
          {
            followUpId: id,
          },
        ),
      });
      return updated;
    });
  }

  async reminders(query: RemindersQueryDto, actor: Actor) {
    const now = new Date();
    const startToday = new Date(now);
    startToday.setUTCHours(0, 0, 0, 0);
    const endToday = new Date(startToday);
    endToday.setUTCDate(endToday.getUTCDate() + 1);
    let dateFilter: Prisma.DateTimeNullableFilter = { not: null };
    if (query.range === 'overdue') dateFilter = { lt: now };
    if (query.range === 'today') dateFilter = { gte: startToday, lt: endToday };
    if (query.range === 'upcoming') dateFilter = { gte: endToday };

    return this.prisma.leadFollowUp.findMany({
      where: {
        completedAt: null,
        nextFollowUpAt: dateFilter,
        lead: this.accessScope(actor),
      },
      include: {
        lead: {
          include: {
            assignedTo: { select: { id: true, name: true, email: true } },
          },
        },
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { nextFollowUpAt: 'asc' },
      take: query.limit,
    });
  }

  async timeline(leadId: string, actor: Actor) {
    await this.accessibleLead(leadId, actor);
    return this.prisma.leadActivity.findMany({
      where: { leadId },
      include: {
        actor: { select: { id: true, name: true, email: true, role: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async archive(id: string, actor: Actor, restore = false) {
    await this.accessibleLead(id, actor);
    return this.prisma.$transaction(async (tx) => {
      const lead = await tx.lead.update({
        where: { id },
        data: { archivedAt: restore ? null : new Date() },
        include: leadRelations,
      });
      await tx.leadActivity.create({
        data: this.activity(
          id,
          actor.id,
          restore ? LeadActivityType.RESTORED : LeadActivityType.ARCHIVED,
        ),
      });
      return lead;
    });
  }

  async dashboardSummary(query: DashboardQueryDto, actor: Actor) {
    const createdAt =
      query.from || query.to
        ? {
            gte: query.from ? new Date(query.from) : undefined,
            lte: query.to ? new Date(query.to) : undefined,
          }
        : undefined;
    const where: Prisma.LeadWhereInput = {
      ...this.accessScope(actor),
      archivedAt: null,
      createdAt,
    };
    const [total, byStatus, bySource, byPriority, overdueFollowUps, assigned] =
      await Promise.all([
        this.prisma.lead.count({ where }),
        this.prisma.lead.groupBy({
          by: ['status'],
          where,
          _count: { _all: true },
        }),
        this.prisma.lead.groupBy({
          by: ['source'],
          where,
          _count: { _all: true },
        }),
        this.prisma.lead.groupBy({
          by: ['priority'],
          where,
          _count: { _all: true },
        }),
        this.prisma.leadFollowUp.count({
          where: {
            completedAt: null,
            nextFollowUpAt: { lt: new Date() },
            lead: { ...this.accessScope(actor), archivedAt: null },
          },
        }),
        this.prisma.lead.count({
          where: { ...where, assignedToId: { not: null } },
        }),
      ]);
    const won =
      byStatus.find((item) => item.status === LeadStatus.WON)?._count._all ?? 0;
    let salesPerformance: Array<{
      user: { id: string; name: string; email: string };
      total: number;
      won: number;
      conversionRate: number;
    }> = [];
    if (actor.role !== Role.SALES) {
      const [totals, wins] = await Promise.all([
        this.prisma.lead.groupBy({
          by: ['assignedToId'],
          where: { ...where, assignedToId: { not: null } },
          _count: { _all: true },
        }),
        this.prisma.lead.groupBy({
          by: ['assignedToId'],
          where: {
            ...where,
            assignedToId: { not: null },
            status: LeadStatus.WON,
          },
          _count: { _all: true },
        }),
      ]);
      const userIds = totals
        .map((item) => item.assignedToId)
        .filter((id): id is string => Boolean(id));
      const users = await this.prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, email: true },
      });
      const winCounts = new Map(
        wins.map((item) => [item.assignedToId, item._count._all]),
      );
      salesPerformance = totals.flatMap((item) => {
        const user = users.find(
          (candidate) => candidate.id === item.assignedToId,
        );
        if (!user) return [];
        const userWon = winCounts.get(item.assignedToId) ?? 0;
        return [
          {
            user,
            total: item._count._all,
            won: userWon,
            conversionRate: Number(
              ((userWon / item._count._all) * 100).toFixed(2),
            ),
          },
        ];
      });
    }
    return {
      total,
      assigned,
      unassigned: total - assigned,
      won,
      conversionRate: total ? Number(((won / total) * 100).toFixed(2)) : 0,
      overdueFollowUps,
      byStatus: Object.fromEntries(
        byStatus.map((item) => [item.status, item._count._all]),
      ),
      bySource: Object.fromEntries(
        bySource.map((item) => [item.source, item._count._all]),
      ),
      byPriority: Object.fromEntries(
        byPriority.map((item) => [item.priority, item._count._all]),
      ),
      salesPerformance,
    };
  }

  private async assertActiveSalesUser(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, role: Role.SALES, isActive: true },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('Active sales user not found');
  }
}
