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
  LeadType,
  Prisma,
  Role,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CalendarService } from '../calendar/calendar.service';
import { TeamsNotificationService } from '../notifications/teams-notification.service';
import { EmailService } from '../email/email.service';
import { CalendarQueryDto } from './dto/calendar-query.dto';
import { DashboardQueryDto } from './dto/dashboard-query.dto';
import { ListLeadsQueryDto } from './dto/list-leads-query.dto';
import { RemindersQueryDto } from './dto/reminders-query.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';

const FOLLOW_UP_TYPE_LABELS: Record<string, string> = {
  CALL: 'Call',
  EMAIL: 'Email',
  MEETING: 'Meeting',
  NOTE: 'Note',
};

type Actor = { id: string; role: Role };

const leadRelations = {
  assignedTo: { select: { id: true, name: true, email: true, role: true } },
  createdBy: { select: { id: true, name: true, email: true, role: true } },
} satisfies Prisma.LeadInclude;

@Injectable()
export class LeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly calendar: CalendarService,
    private readonly teamsNotifications: TeamsNotificationService,
    private readonly email: EmailService,
  ) {}

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
      leadType?: LeadType;
      city?: string;
      state?: string;
      product?: string;
      quantity?: number;
      productDescription?: string;
      spokenOn?: string;
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

    const lead = await this.prisma.$transaction(async (tx) => {
      const created = await tx.lead.create({
        data: {
          ...data,
          source: data.source ?? LeadSource.WEBSITE,
          status: data.status ?? LeadStatus.NEW,
          priority: data.priority ?? LeadPriority.MEDIUM,
          leadType: data.leadType ?? LeadType.INTERNAL,
          spokenOn: data.spokenOn ? new Date(data.spokenOn) : undefined,
          createdById: actor.id,
          unassignedAt: data.assignedToId ? null : new Date(),
        },
        include: leadRelations,
      });
      await tx.leadActivity.create({
        data: this.activity(created.id, actor.id, LeadActivityType.CREATED, {
          status: created.status,
          assignedToId: created.assignedToId,
        }),
      });
      return created;
    });

    await Promise.allSettled([
      this.teamsNotifications.notifyNewLead({
        id: lead.id,
        fullName: lead.fullName,
        company: lead.company,
        email: lead.email,
        phone: lead.phone,
        source: lead.source,
        assignedToName: lead.assignedTo?.name ?? null,
      }),
      ...(lead.email
        ? [
            this.email.sendLeadAcknowledgementEmail({
              leadId: lead.id,
              toEmail: lead.email,
              clientName: lead.fullName,
            }),
          ]
        : []),
      ...(lead.assignedTo
        ? [
            this.email.sendLeadAssignmentEmail({
              leadId: lead.id,
              salespersonEmail: lead.assignedTo.email,
              salespersonName: lead.assignedTo.name,
              leadName: lead.fullName,
              company: lead.company,
            }),
          ]
        : []),
    ]);
    return lead;
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
    if (query.leadType) filters.push({ leadType: query.leadType });
    if (query.assignedToId && actor.role !== Role.SALES)
      filters.push({ assignedToId: query.assignedToId });
    if (query.archived === 'active') filters.push({ archivedAt: null });
    if (query.archived === 'archived')
      filters.push({ archivedAt: { not: null } });
    if (query.prospect === 'exclude') filters.push({ prospectedAt: null });
    if (query.prospect === 'only')
      filters.push({ prospectedAt: { not: null } });
    if (query.createdFrom || query.createdTo) {
      filters.push({
        createdAt: {
          gte: query.createdFrom ? new Date(query.createdFrom) : undefined,
          lte: query.createdTo ? new Date(query.createdTo) : undefined,
        },
      });
    }
    if (query.prospectedFrom || query.prospectedTo) {
      filters.push({
        prospectedAt: {
          gte: query.prospectedFrom ? new Date(query.prospectedFrom) : undefined,
          lte: query.prospectedTo ? new Date(query.prospectedTo) : undefined,
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
        data: {
          ...data,
          spokenOn:
            data.spokenOn === undefined
              ? undefined
              : data.spokenOn
                ? new Date(data.spokenOn)
                : null,
        },
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
            leadType: current.leadType,
            notes: current.notes,
          },
          changes: { ...data } as Prisma.InputJsonObject,
        }),
      });
      return lead;
    });
  }

  async assignLead(leadId: string, salesId: string | null, actor: Actor) {
    const lead = await this.accessibleLead(leadId, actor);
    this.assertActiveLead(lead);
    if (lead.assignedToId === salesId) {
      return this.prisma.lead.findUnique({
        where: { id: leadId },
        include: leadRelations,
      });
    }
    if (salesId) await this.assertActiveSalesUser(salesId);
    const updated = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.lead.update({
        where: { id: leadId },
        data: {
          assignedToId: salesId,
          unassignedAt: salesId ? null : new Date(),
          slaReminderSentAt: null,
          slaEscalatedAt: null,
        },
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
    if (updated.assignedTo) {
      await this.email.sendLeadAssignmentEmail({
        leadId: updated.id,
        salespersonEmail: updated.assignedTo.email,
        salespersonName: updated.assignedTo.name,
        leadName: updated.fullName,
        company: updated.company,
      });
    }
    return updated;
  }

  async updateStatus(leadId: string, status: LeadStatus, actor: Actor) {
    const lead = await this.accessibleLead(leadId, actor);
    this.assertActiveLead(lead);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.lead.update({
        where: { id: leadId },
        data: {
          status,
          wonAt: status === LeadStatus.WON ? new Date() : lead.wonAt,
        },
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
    const followUp = await this.prisma.$transaction(async (tx) => {
      const created = await tx.leadFollowUp.create({
        data: {
          ...data,
          userId: actor.id,
          nextFollowUpAt: data.nextFollowUpAt
            ? new Date(data.nextFollowUpAt)
            : undefined,
        },
        include: { user: { select: { id: true, name: true, email: true } } },
      });
      if (created.nextFollowUpAt) {
        await tx.lead.update({
          where: { id: data.leadId },
          data: { nextFollowUpAt: created.nextFollowUpAt },
        });
      }
      await tx.leadActivity.create({
        data: this.activity(
          data.leadId,
          actor.id,
          LeadActivityType.FOLLOW_UP_ADDED,
          {
            followUpId: created.id,
            type: created.type,
            nextFollowUpAt: created.nextFollowUpAt?.toISOString() ?? null,
          },
        ),
      });
      return created;
    });

    // Calendar sync happens outside the DB transaction (it's a network call
    // to Microsoft Graph) and must never fail the follow-up itself — same
    // graceful-degradation contract as unconfigured SMTP for email sending.
    // CalendarService already swallows its own errors, but this try/catch
    // also covers the follow-up record update below.
    if (followUp.nextFollowUpAt) {
      try {
        // The event belongs on the LEAD'S assigned salesperson's calendar,
        // not the follow-up creator's — an Admin/SuperAdmin can log a
        // follow-up on a lead assigned to someone else. Fall back to the
        // creator only when the lead has nobody assigned yet.
        const assignedUser = lead.assignedToId
          ? await this.prisma.user.findUnique({
              where: { id: lead.assignedToId },
              select: { email: true },
            })
          : null;
        const calendarMailbox = assignedUser?.email ?? followUp.user.email;

        const isMeeting = followUp.type === 'MEETING';
        const { eventId, joinUrl, error } =
          await this.calendar.createFollowUpEvent({
            userEmail: calendarMailbox,
            subject: `${FOLLOW_UP_TYPE_LABELS[followUp.type] ?? followUp.type}: ${lead.fullName}${lead.company ? ` (${lead.company})` : ''}`,
            body: `${FOLLOW_UP_TYPE_LABELS[followUp.type] ?? followUp.type} follow-up for ${lead.fullName}.\n\nNotes: ${followUp.notes}`,
            start: followUp.nextFollowUpAt,
            // Only meetings get an actual Teams video link; a plain call or
            // note reminder doesn't need one.
            isOnlineMeeting: isMeeting,
          });
        await this.prisma.leadFollowUp.update({
          where: { id: followUp.id },
          data: {
            calendarMailbox,
            calendarEventId: eventId,
            calendarSyncError: error,
            teamsJoinUrl: isMeeting ? joinUrl : null,
          },
        });
        followUp.calendarEventId = eventId;
        followUp.calendarSyncError = error;
        followUp.teamsJoinUrl = isMeeting ? joinUrl : null;

        // Let the client know about the meeting too, not just the
        // salesperson's calendar — only once we actually have a real link.
        if (isMeeting && joinUrl && lead.email) {
          await this.email.sendMeetingInviteEmail({
            leadId: lead.id,
            toEmail: lead.email,
            clientName: lead.fullName,
            meetingTime: followUp.nextFollowUpAt,
            joinUrl,
            subject: `${lead.fullName}${lead.company ? ` (${lead.company})` : ''}`,
            notes: followUp.notes,
          });
        }
      } catch {
        // Already logged inside CalendarService/EmailService; the follow-up
        // itself is already saved, so nothing further to do here.
      }
    }
    return followUp;
  }

  async completeFollowUp(id: string, actor: Actor) {
    const followUp = await this.prisma.leadFollowUp.findUnique({
      where: { id },
      include: { user: { select: { email: true } } },
    });
    if (!followUp) throw new NotFoundException('Follow-up not found');
    await this.accessibleLead(followUp.leadId, actor);
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.leadFollowUp.update({
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
      return result;
    });

    if (followUp.calendarEventId) {
      try {
        await this.calendar.deleteEvent(
          followUp.calendarMailbox ?? followUp.user.email,
          followUp.calendarEventId,
        );
        await this.prisma.leadFollowUp.update({
          where: { id },
          data: { calendarEventId: null, teamsJoinUrl: null },
        });
      } catch {
        // Already logged inside CalendarService; completion itself already
        // succeeded, so nothing further to do here.
      }
    }
    return updated;
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

    const reminders = await this.prisma.leadFollowUp.findMany({
      where: {
        completedAt: null,
        nextFollowUpAt: dateFilter,
        lead: { ...this.accessScope(actor), archivedAt: null },
      },
      include: {
        lead: {
          include: {
            assignedTo: { select: { id: true, name: true, email: true } },
          },
        },
        user: { select: { id: true, name: true, email: true } },
        reads: { where: { userId: actor.id }, select: { seenAt: true } },
      },
      orderBy: { nextFollowUpAt: 'asc' },
      take: query.limit,
    });
    return reminders.map(({ reads, ...reminder }) => ({
      ...reminder,
      seenAt: reads[0]?.seenAt ?? null,
    }));
  }

  // Badge count for the notification bell — cheaper than fetching the full
  // reminders list just to measure it, and not bounded by `query.limit`.
  async unreadReminderCount(actor: Actor) {
    const count = await this.prisma.leadFollowUp.count({
      where: {
        completedAt: null,
        nextFollowUpAt: { not: null },
        lead: { ...this.accessScope(actor), archivedAt: null },
        reads: { none: { userId: actor.id } },
      },
    });
    return { count };
  }

  // Marks reminders as seen for the current user only — read state is
  // per-user (an Admin and the assigned salesperson see overlapping but
  // different reminder lists), so this can never affect another user's badge.
  async markRemindersSeen(followUpIds: string[], actor: Actor) {
    const visible = await this.prisma.leadFollowUp.findMany({
      where: { id: { in: followUpIds }, lead: this.accessScope(actor) },
      select: { id: true },
    });
    if (!visible.length) return { marked: 0 };
    const result = await this.prisma.followUpRead.createMany({
      data: visible.map(({ id }) => ({ userId: actor.id, followUpId: id })),
      skipDuplicates: true,
    });
    return { marked: result.count };
  }

  // Powers the calendar-grid view: unlike reminders() this returns every
  // follow-up in the visible window regardless of completion status, so a
  // day that already happened still shows what was scheduled on it.
  async calendarEvents(query: CalendarQueryDto, actor: Actor) {
    return this.prisma.leadFollowUp.findMany({
      where: {
        nextFollowUpAt: { gte: new Date(query.from), lt: new Date(query.to) },
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
      take: 1000,
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

  // Prospect is a separate track from `status` — a salesperson calls this
  // after a first call/meeting convinces them the lead is worth pursuing.
  // Moving in takes the lead out of the main Leads list (mirrors archive);
  // moving back out (unprospect === true) restores it there.
  async setProspect(id: string, actor: Actor, unprospect = false) {
    const lead = await this.accessibleLead(id, actor);
    this.assertActiveLead(lead);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.lead.update({
        where: { id },
        data: { prospectedAt: unprospect ? null : new Date() },
        include: leadRelations,
      });
      await tx.leadActivity.create({
        data: this.activity(
          id,
          actor.id,
          unprospect
            ? LeadActivityType.UNMARKED_PROSPECT
            : LeadActivityType.MARKED_PROSPECT,
        ),
      });
      return updated;
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
    const followUpScope = { ...this.accessScope(actor), archivedAt: null };
    const [
      total,
      byStatus,
      bySource,
      byPriority,
      overdueFollowUps,
      assigned,
      callsLogged,
      meetingsLogged,
      followUpsLogged,
      recentWins,
    ] = await Promise.all([
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
            lead: followUpScope,
          },
        }),
        this.prisma.lead.count({
          where: { AND: [where, { assignedToId: { not: null } }] },
        }),
        this.prisma.leadFollowUp.count({
          where: { type: 'CALL', createdAt, lead: followUpScope },
        }),
        this.prisma.leadFollowUp.count({
          where: { type: 'MEETING', createdAt, lead: followUpScope },
        }),
        // Every follow-up type combined (CALL, EMAIL, MEETING, NOTE) — the
        // spreadsheet tracked this as its own "Follow-ups" column, separate
        // from the Call/Meeting breakdowns above.
        this.prisma.leadFollowUp.count({
          where: { createdAt, lead: followUpScope },
        }),
        // Filtered by wonAt within the requested range, not createdAt — a
        // lead created long ago but won within this range still belongs in
        // "recent wins", and one created in-range but won outside it (or
        // not at all) does not.
        this.prisma.lead.findMany({
          where: {
            ...this.accessScope(actor),
            archivedAt: null,
            wonAt: createdAt ?? { not: null },
          },
          select: { id: true, fullName: true, company: true, wonAt: true },
          orderBy: { wonAt: 'desc' },
          take: 20,
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
      callsLogged,
      meetingsLogged,
      followUpsLogged,
      recentWins,
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
