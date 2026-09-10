import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '../prisma/prisma.service';
import { LeadActivityType, Role } from '@prisma/client';
import { SettingsService } from '../settings/settings.service';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly settings: SettingsService,
  ) {}

  async sendLeadEmail(
    data: {
      leadId?: string;
      toEmail: string;
      ccEmails?: string[];
      bccEmails?: string[];
      subject: string;
      body: string;
    },
    actor: { id: string; role: Role },
  ) {
    if (data.leadId) {
      const lead = await this.prisma.lead.findUnique({
        where: { id: data.leadId },
      });
      if (!lead) throw new NotFoundException('Lead not found');
      if (lead.archivedAt)
        throw new ForbiddenException('Restore the lead before sending email');
      if (actor.role === Role.SALES && lead.assignedToId !== actor.id) {
        throw new NotFoundException('Lead not found');
      }
    } else if (actor.role === Role.SALES) {
      throw new ForbiddenException(
        'Sales users can send email only from an assigned lead',
      );
    }
    const smtpHost = this.configService.get<string>('SMTP_HOST');
    const smtpPort = Number(this.configService.get<string>('SMTP_PORT') ?? 587);
    const smtpUser = this.configService.get<string>('SMTP_USER');
    const smtpPass = this.configService.get<string>('SMTP_PASS');
    const smtpFrom =
      this.configService.get<string>('SMTP_FROM') ??
      smtpUser ??
      'no-reply@localhost';

    // Company-wide defaults, set by a SuperAdmin via Settings > Email, are
    // merged on top of whatever the sender typed for this one email — the
    // sender's own choices are never dropped, just supplemented.
    const emailSettings = await this.settings.getEmailSettings();
    const ccList = [
      ...new Set([...(data.ccEmails ?? []), ...emailSettings.ccEmails]),
    ];
    const bccList = [
      ...new Set([...(data.bccEmails ?? []), ...emailSettings.bccEmails]),
    ];

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth:
        smtpUser && smtpPass ? { user: smtpUser, pass: smtpPass } : undefined,
    });

    let sentStatus: 'SENT' | 'FAILED' = 'FAILED';
    let response: any = null;

    if (smtpHost && smtpUser && smtpPass) {
      response = await transporter.sendMail({
        from: smtpFrom,
        to: data.toEmail,
        cc: ccList,
        bcc: bccList,
        subject: data.subject,
        html: data.body,
        text: data.body,
      });
      sentStatus = response?.accepted?.length ? 'SENT' : 'FAILED';
    }

    const emailLog = await this.prisma.emailLog.create({
      data: {
        leadId: data.leadId,
        userId: actor.id,
        toEmail: data.toEmail,
        ccEmails: ccList,
        bccEmails: bccList,
        subject: data.subject,
        body: data.body,
        status: sentStatus,
        messageId: response?.messageId ?? null,
        sentAt: sentStatus === 'SENT' ? new Date() : null,
      },
    });

    if (data.leadId) {
      await this.prisma.leadActivity.create({
        data: {
          leadId: data.leadId,
          actorId: actor.id,
          type: LeadActivityType.EMAIL_SENT,
          details: {
            emailLogId: emailLog.id,
            toEmail: data.toEmail,
            status: sentStatus,
          },
        },
      });
    }

    return {
      message:
        sentStatus === 'SENT'
          ? 'Email sent successfully'
          : 'SMTP not configured; email logged only',
      emailLog,
      delivery: response ?? null,
    };
  }

  // Triggered automatically by LeadsService when a MEETING follow-up gets a
  // Teams join link — no `actor`/role checks here since it's system-initiated,
  // not a specific user clicking "send". Never throws: SMTP failure is
  // recorded on the EmailLog row (same non-throwing contract as
  // sendLeadEmail) so it can never break follow-up creation itself.
  async sendMeetingInviteEmail(data: {
    leadId: string;
    toEmail: string;
    clientName: string;
    meetingTime: Date;
    joinUrl: string;
    subject: string;
    notes?: string | null;
  }) {
    const smtpHost = this.configService.get<string>('SMTP_HOST');
    const smtpPort = Number(this.configService.get<string>('SMTP_PORT') ?? 587);
    const smtpUser = this.configService.get<string>('SMTP_USER');
    const smtpPass = this.configService.get<string>('SMTP_PASS');
    const smtpFrom =
      this.configService.get<string>('SMTP_FROM') ??
      smtpUser ??
      'no-reply@localhost';

    const formattedTime = data.meetingTime.toLocaleString('en-IN', {
      dateStyle: 'full',
      timeStyle: 'short',
      timeZone: 'Asia/Kolkata',
    });
    const subject = `Meeting invite: ${data.subject}`;
    const body = `<p>Hi ${this.escape(data.clientName)},</p><p>A meeting has been scheduled with you on <strong>${formattedTime}</strong> (IST).</p><p><a href="${data.joinUrl}">Click here to join the Teams meeting</a></p>${data.notes ? `<p>${this.escape(data.notes)}</p>` : ''}`;

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth:
        smtpUser && smtpPass ? { user: smtpUser, pass: smtpPass } : undefined,
    });

    let sentStatus: 'SENT' | 'FAILED' = 'FAILED';
    let messageId: string | null = null;
    if (smtpHost && smtpUser && smtpPass) {
      try {
        const response = await transporter.sendMail({
          from: smtpFrom,
          to: data.toEmail,
          subject,
          html: body,
          text: body.replace(/<[^>]+>/g, ' '),
        });
        sentStatus = response?.accepted?.length ? 'SENT' : 'FAILED';
        messageId = response?.messageId ?? null;
      } catch {
        sentStatus = 'FAILED';
      }
    }

    await this.prisma.emailLog.create({
      data: {
        leadId: data.leadId,
        toEmail: data.toEmail,
        ccEmails: [],
        bccEmails: [],
        subject,
        body,
        status: sentStatus,
        messageId,
        sentAt: sentStatus === 'SENT' ? new Date() : null,
      },
    });
  }

  async sendLeadAcknowledgementEmail(data: {
    leadId: string;
    toEmail: string;
    clientName: string;
  }) {
    if (
      this.configService
        .get<string>('LEAD_ACKNOWLEDGEMENT_ENABLED')
        ?.toLowerCase() === 'false'
    ) {
      return false;
    }
    const companyName =
      this.configService.get<string>('COMPANY_NAME') || 'EICE Technology';
    const subject = `We received your enquiry - ${companyName}`;
    const body = `<p>Hello ${this.escape(data.clientName)},</p><p>Thank you for contacting ${this.escape(companyName)}. We have received your enquiry and a member of our team will contact you shortly.</p><p>Regards,<br>${this.escape(companyName)}</p>`;
    return this.sendAutomatedLeadEmail({
      leadId: data.leadId,
      toEmail: data.toEmail,
      subject,
      body,
    });
  }

  async sendLeadAssignmentEmail(data: {
    leadId: string;
    salespersonEmail: string;
    salespersonName: string;
    leadName: string;
    company?: string | null;
  }) {
    if (
      this.configService
        .get<string>('LEAD_ASSIGNMENT_EMAIL_ENABLED')
        ?.toLowerCase() === 'false'
    ) {
      return false;
    }
    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';
    const subject = `Lead assigned: ${data.leadName}`;
    const body = `<p>Hello ${this.escape(data.salespersonName)},</p><p>A lead has been assigned to you.</p><p><strong>${this.escape(data.leadName)}</strong>${data.company ? ` — ${this.escape(data.company)}` : ''}</p><p><a href="${this.escape(`${frontendUrl}/leads/${data.leadId}`)}">Open lead in LMS</a></p>`;
    return this.sendAutomatedLeadEmail({
      leadId: data.leadId,
      toEmail: data.salespersonEmail,
      subject,
      body,
    });
  }

  private async sendAutomatedLeadEmail(data: {
    leadId: string;
    toEmail: string;
    subject: string;
    body: string;
  }) {
    const smtpHost = this.configService.get<string>('SMTP_HOST');
    const smtpPort = Number(this.configService.get<string>('SMTP_PORT') ?? 587);
    const smtpUser = this.configService.get<string>('SMTP_USER');
    const smtpPass = this.configService.get<string>('SMTP_PASS');
    const smtpFrom = this.configService.get<string>('SMTP_FROM') ?? smtpUser;
    let sentStatus: 'SENT' | 'FAILED' = 'FAILED';
    let messageId: string | null = null;

    if (smtpHost && smtpUser && smtpPass && smtpFrom) {
      try {
        const transporter = nodemailer.createTransport({
          host: smtpHost,
          port: smtpPort,
          secure: smtpPort === 465,
          auth: { user: smtpUser, pass: smtpPass },
        });
        const response = await transporter.sendMail({
          from: smtpFrom,
          to: data.toEmail,
          subject: data.subject,
          html: data.body,
          text: data.body.replace(/<[^>]+>/g, ' '),
        });
        sentStatus = response?.accepted?.length ? 'SENT' : 'FAILED';
        messageId = response?.messageId ?? null;
      } catch (error) {
        this.logger.warn(
          `Automated lead email failed for lead ${data.leadId}: ${error instanceof Error ? error.message : 'Unknown SMTP error'}`,
        );
      }
    }

    try {
      await this.prisma.emailLog.create({
        data: {
          leadId: data.leadId,
          toEmail: data.toEmail,
          ccEmails: [],
          bccEmails: [],
          subject: data.subject,
          body: data.body,
          status: sentStatus,
          messageId,
          sentAt: sentStatus === 'SENT' ? new Date() : null,
        },
      });
    } catch (error) {
      this.logger.warn(
        `Could not log automated email for lead ${data.leadId}: ${error instanceof Error ? error.message : 'Unknown database error'}`,
      );
    }
    return sentStatus === 'SENT';
  }

  // Called by InboundEmailService once it's matched an incoming reply to a
  // lead via In-Reply-To/References threading. The client keeps seeing and
  // replying to the one shared address; this is what actually gets the
  // salesperson to see it, landing in their own real mailbox via normal SMTP
  // delivery rather than any Graph mailbox-injection.
  async forwardReplyToRecipient(data: {
    toEmail: string;
    leadId: string;
    leadName: string;
    fromAddress: string;
    originalSubject: string;
    replyText: string;
  }) {
    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';
    const subject = `Client replied: ${data.leadName}`;
    const body = `<p>${this.escape(data.fromAddress)} replied on <strong>${this.escape(data.originalSubject)}</strong>:</p><blockquote style="border-left:3px solid #ccc;margin:0;padding-left:12px;color:#444;">${this.escape(data.replyText).replaceAll('\n', '<br>')}</blockquote><p><a href="${this.escape(`${frontendUrl}/leads/${data.leadId}`)}">Open lead in LMS</a></p>`;
    return this.sendAutomatedLeadEmail({
      leadId: data.leadId,
      toEmail: data.toEmail,
      subject,
      body,
    });
  }

  // A staff member replied from their own mailbox to a lead they don't own
  // (SALES not assigned to it) — the reply is blocked from reaching the
  // client (see InboundEmailService), and this tells the actual owner so
  // the client doesn't just get silently ignored.
  async notifyBlockedStaffReply(data: {
    leadId: string;
    leadName: string;
    staffEmail: string;
    toEmail: string;
    originalSubject: string;
    replyText: string;
  }) {
    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';
    const subject = `Blocked reply attempt on lead: ${data.leadName}`;
    const body = `<p>${this.escape(data.staffEmail)} tried to reply to the client on <strong>${this.escape(data.leadName)}</strong>, but is not the assigned salesperson for this lead, so the reply was NOT sent.</p><p>Original subject: <strong>${this.escape(data.originalSubject)}</strong></p><blockquote style="border-left:3px solid #ccc;margin:0;padding-left:12px;color:#444;">${this.escape(data.replyText).replaceAll('\n', '<br>')}</blockquote><p><a href="${this.escape(`${frontendUrl}/leads/${data.leadId}`)}">Open lead in LMS</a></p>`;
    return this.sendAutomatedLeadEmail({
      leadId: data.leadId,
      toEmail: data.toEmail,
      subject,
      body,
    });
  }

  // Staff sometimes reply from their own real mailbox to the "Client
  // replied" notification instead of using the LMS UI — that reply lands
  // back in the shared inbox just like a client reply would. This is what
  // actually gets it out to the client, instead of InboundEmailService
  // bouncing another "client replied" notification back to the same staff
  // member who just wrote it.
  async relayStaffReplyToClient(data: {
    leadId: string;
    toEmail: string;
    subject: string;
    body: string;
  }) {
    const html = `<p>${this.escape(data.body).replaceAll('\n', '<br>')}</p>`;
    return this.sendAutomatedLeadEmail({
      leadId: data.leadId,
      toEmail: data.toEmail,
      subject: data.subject,
      body: html,
    });
  }

  // Records the reply itself against the lead — separate from the forward
  // above, which is about getting a human to notice; this is what makes it
  // show up in the lead's own Emails/timeline history.
  async logInboundReply(data: {
    leadId: string;
    fromEmail: string;
    subject: string;
    body: string;
  }) {
    const emailLog = await this.prisma.emailLog.create({
      data: {
        leadId: data.leadId,
        toEmail: data.fromEmail,
        ccEmails: [],
        bccEmails: [],
        subject: data.subject,
        body: data.body,
        status: 'SENT',
        direction: 'INBOUND',
        sentAt: new Date(),
      },
    });
    await this.prisma.leadActivity.create({
      data: {
        leadId: data.leadId,
        type: LeadActivityType.EMAIL_REPLY_RECEIVED,
        details: { emailLogId: emailLog.id, fromEmail: data.fromEmail },
      },
    });
    return emailLog;
  }

  private escape(value: string) {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  async sendSystemEmail(toEmail: string, subject: string, html: string) {
    const smtpHost = this.configService.get<string>('SMTP_HOST');
    const smtpPort = Number(this.configService.get<string>('SMTP_PORT') ?? 587);
    const smtpUser = this.configService.get<string>('SMTP_USER');
    const smtpPass = this.configService.get<string>('SMTP_PASS');
    const smtpFrom = this.configService.get<string>('SMTP_FROM') ?? smtpUser;
    if (!smtpHost || !smtpUser || !smtpPass || !smtpFrom) {
      throw new Error('SMTP is not configured');
    }

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: { user: smtpUser, pass: smtpPass },
    });

    await transporter.sendMail({
      from: smtpFrom,
      to: toEmail,
      subject,
      html,
      text: html.replace(/<[^>]+>/g, ' '),
    });
  }
}
