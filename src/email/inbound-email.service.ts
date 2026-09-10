import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from './email.service';

// The client always sees and replies to the one shared address (no
// Reply-To redirect) — this polling job is what picks a reply back up out
// of that shared inbox and fans it out to (1) the assigned salesperson's
// own real mailbox and (2) the lead's record in the LMS. Same polling-timer
// shape as LeadSlaService/MeetingSyncService, not a webhook — see the
// two-way-sync discussion this mirrors.
@Injectable()
export class InboundEmailService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(InboundEmailService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly email: EmailService,
  ) {}

  onModuleInit() {
    if (
      this.config.get<string>('INBOUND_EMAIL_ENABLED')?.toLowerCase() !==
      'true'
    ) {
      this.logger.log('Inbound email capture is disabled');
      return;
    }
    const intervalMinutes = this.positiveMinutes(
      'INBOUND_EMAIL_CHECK_INTERVAL_MINUTES',
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
      const user = this.config.get<string>('IMAP_USER');
      const pass = this.config.get<string>('IMAP_PASS');
      if (!user || !pass) return;
      const host = this.config.get<string>('IMAP_HOST') || 'imap.gmail.com';
      const port = Number(this.config.get<string>('IMAP_PORT') ?? 993);

      const client = new ImapFlow({
        host,
        port,
        secure: true,
        auth: { user, pass },
        logger: false,
      });
      await client.connect();
      try {
        const lock = await client.getMailboxLock('INBOX');
        try {
          const uids = await client.search({ seen: false }, { uid: true });
          for (const uid of uids || []) {
            await this.handleMessage(client, uid);
          }
        } finally {
          lock.release();
        }
      } finally {
        await client.logout();
      }
    } finally {
      this.running = false;
    }
  }

  private async handleMessage(client: ImapFlow, uid: number) {
    const msg = await client.fetchOne(
      String(uid),
      { source: true },
      { uid: true },
    );
    if (!msg || !msg.source) return;
    const parsed = await simpleParser(msg.source);

    const references = Array.isArray(parsed.references)
      ? parsed.references
      : parsed.references
        ? [parsed.references]
        : [];
    const candidates = [parsed.inReplyTo, ...references].filter(
      (v): v is string => Boolean(v),
    );
    // Not a reply to anything we ever sent — leave it unread for a human to
    // check manually rather than silently discarding it.
    if (!candidates.length) return;

    const matchedLog = await this.prisma.emailLog.findFirst({
      where: { messageId: { in: candidates }, direction: 'OUTBOUND' },
      orderBy: { createdAt: 'desc' },
      include: { lead: { include: { assignedTo: true } } },
    });
    if (!matchedLog?.leadId || !matchedLog.lead) return;

    // Claim this message's own Message-ID before doing anything with side
    // effects. If a previous run already claimed it (e.g. it crashed or the
    // \Seen flag update failed after the relay/notification already went
    // out), this is a no-op instead of sending everything a second time.
    if (parsed.messageId) {
      const claimed = await this.claimMessage(parsed.messageId);
      if (!claimed) {
        await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true });
        return;
      }
    }

    const fromAddress = parsed.from?.value?.[0]?.address ?? 'unknown sender';
    const replyText =
      parsed.text || (parsed.html ? parsed.html.replace(/<[^>]+>/g, ' ') : '');
    const subject = parsed.subject || matchedLog.subject;

    // A staff member replying from their own real mailbox (to the "Client
    // replied" notification) lands in this same shared inbox. Relay it on
    // to the client instead of treating it as another client reply and
    // forwarding a notification back to the very person who just wrote it.
    const staffSender = await this.prisma.user.findFirst({
      where: { email: { equals: fromAddress, mode: 'insensitive' } },
      select: { id: true, role: true },
    });
    if (staffSender) {
      // Mirror EmailService.sendLeadEmail's rule: a SALES user may only act
      // on their own assigned leads. Without this check, any active user's
      // reply gets relayed straight to the client regardless of ownership.
      const authorized =
        staffSender.role !== Role.SALES ||
        matchedLog.lead.assignedToId === staffSender.id;

      if (authorized && matchedLog.lead.email) {
        // Build the client-facing subject from the original outbound
        // thread's subject, never from `subject` above — that one is the
        // staff member's own reply subject, e.g. "Re: Client replied:
        // <lead>" (they replied to our internal notification email), which
        // would otherwise leak that internal wording to the client.
        const originalSubject = matchedLog.subject.replace(/^re:\s*/i, '');
        await this.email.relayStaffReplyToClient({
          leadId: matchedLog.leadId,
          toEmail: matchedLog.lead.email,
          subject: `Re: ${originalSubject}`,
          body: replyText,
        });
      } else if (!authorized) {
        this.logger.warn(
          `Blocked inbound relay: ${fromAddress} is not the assigned salesperson for lead ${matchedLog.leadId}`,
        );
        const owner = matchedLog.lead.assignedTo
          ? [matchedLog.lead.assignedTo.email]
          : await this.activeAdminEmails();
        for (const to of owner) {
          await this.email.notifyBlockedStaffReply({
            leadId: matchedLog.leadId,
            leadName: matchedLog.lead.fullName,
            staffEmail: fromAddress,
            toEmail: to,
            originalSubject: subject,
            replyText,
          });
        }
      }
      await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true });
      return;
    }

    await this.email.logInboundReply({
      leadId: matchedLog.leadId,
      fromEmail: fromAddress,
      subject,
      body: replyText,
    });

    const recipients = matchedLog.lead.assignedTo
      ? [matchedLog.lead.assignedTo.email]
      : await this.activeAdminEmails();
    for (const to of recipients) {
      await this.email.forwardReplyToRecipient({
        toEmail: to,
        leadId: matchedLog.leadId,
        leadName: matchedLog.lead.fullName,
        fromAddress,
        originalSubject: subject,
        replyText,
      });
    }

    await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true });
  }

  private async claimMessage(messageId: string): Promise<boolean> {
    try {
      await this.prisma.processedInboundEmail.create({ data: { messageId } });
      return true;
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        return false;
      }
      throw err;
    }
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
      .then((users) => users.map((u) => u.email));
  }

  private positiveMinutes(key: string, fallback: number) {
    const value = Number(this.config.get<string>(key) ?? fallback);
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }

  private logFailure(error: unknown) {
    this.logger.error(
      `Inbound email processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
}
