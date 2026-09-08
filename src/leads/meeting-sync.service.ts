import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LeadActivityType } from '@prisma/client';
import { CalendarService } from '../calendar/calendar.service';
import { EmailService } from '../email/email.service';
import { PrismaService } from '../prisma/prisma.service';

// Option 1 from the two-way-sync discussion: polling reconciliation, not
// Graph webhooks. A salesperson who reschedules or cancels a Teams meeting
// directly in Outlook/Teams (bypassing the LMS) would otherwise leave the
// LMS silently out of date — this job periodically re-checks each synced
// meeting's calendar event and pulls any change back in. Mirrors
// LeadSlaService's polling-timer shape.
@Injectable()
export class MeetingSyncService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MeetingSyncService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly calendar: CalendarService,
    private readonly email: EmailService,
  ) {}

  onModuleInit() {
    if (
      this.config.get<string>('MEETING_SYNC_ENABLED')?.toLowerCase() !==
      'true'
    ) {
      this.logger.log('Teams meeting two-way sync is disabled');
      return;
    }
    const intervalMinutes = this.positiveMinutes(
      'MEETING_SYNC_CHECK_INTERVAL_MINUTES',
      10,
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
      // Only meetings from the last day onward — a synced meeting nobody
      // ever marked complete from months ago shouldn't be polled forever.
      const lookbackCutoff = new Date(Date.now() - 24 * 60 * 60_000);
      const followUps = await this.prisma.leadFollowUp.findMany({
        where: {
          type: 'MEETING',
          completedAt: null,
          calendarEventId: { not: null },
          calendarMailbox: { not: null },
          nextFollowUpAt: { gte: lookbackCutoff },
          lead: { archivedAt: null },
        },
        select: {
          id: true,
          nextFollowUpAt: true,
          calendarEventId: true,
          calendarMailbox: true,
          teamsJoinUrl: true,
          lead: { select: { id: true, fullName: true, email: true } },
        },
        take: 200,
      });

      for (const followUp of followUps) {
        const remote = await this.calendar.getEvent(
          followUp.calendarMailbox as string,
          followUp.calendarEventId as string,
        );
        if (!remote) {
          await this.applyCancellation(followUp);
          continue;
        }
        const driftMs = Math.abs(
          remote.start.getTime() -
            (followUp.nextFollowUpAt?.getTime() ?? remote.start.getTime()),
        );
        // A minute of tolerance absorbs Graph's second-level rounding —
        // anything beyond that is a genuine reschedule.
        if (driftMs > 60_000) {
          await this.applyReschedule(followUp, remote.start);
        }
      }
    } finally {
      this.running = false;
    }
  }

  private async applyReschedule(
    followUp: {
      id: string;
      nextFollowUpAt: Date | null;
      teamsJoinUrl: string | null;
      lead: { id: string; fullName: string; email: string | null };
    },
    newStart: Date,
  ) {
    const updated = await this.prisma.leadFollowUp.updateMany({
      where: {
        id: followUp.id,
        completedAt: null,
        nextFollowUpAt: followUp.nextFollowUpAt,
      },
      data: { nextFollowUpAt: newStart },
    });
    if (!updated.count) return;
    await this.prisma.leadActivity.create({
      data: {
        leadId: followUp.lead.id,
        type: LeadActivityType.MEETING_RESCHEDULED,
        details: {
          followUpId: followUp.id,
          previousTime: followUp.nextFollowUpAt?.toISOString() ?? null,
          newTime: newStart.toISOString(),
        },
      },
    });
    // The Teams join link itself doesn't change when a meeting is merely
    // moved to a new time — only send the update if we actually have that
    // link, so this never emails a broken href.
    if (followUp.lead.email && followUp.teamsJoinUrl) {
      await this.email.sendMeetingInviteEmail({
        leadId: followUp.lead.id,
        toEmail: followUp.lead.email,
        clientName: followUp.lead.fullName,
        meetingTime: newStart,
        joinUrl: followUp.teamsJoinUrl,
        subject: 'Updated meeting time',
        notes: 'This meeting was rescheduled.',
      });
    }
  }

  private async applyCancellation(followUp: {
    id: string;
    nextFollowUpAt: Date | null;
    lead: { id: string };
  }) {
    const updated = await this.prisma.leadFollowUp.updateMany({
      where: {
        id: followUp.id,
        completedAt: null,
        nextFollowUpAt: followUp.nextFollowUpAt,
      },
      data: { nextFollowUpAt: null, teamsJoinUrl: null },
    });
    if (!updated.count) return;
    await this.prisma.leadActivity.create({
      data: {
        leadId: followUp.lead.id,
        type: LeadActivityType.MEETING_CANCELLED,
        details: { followUpId: followUp.id },
      },
    });
  }

  private positiveMinutes(key: string, fallback: number) {
    const value = Number(this.config.get<string>(key) ?? fallback);
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }

  private logFailure(error: unknown) {
    this.logger.error(
      `Meeting sync processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
}
