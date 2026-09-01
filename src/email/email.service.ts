import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '../prisma/prisma.service';
import { LeadActivityType, Role } from '@prisma/client';
import { SettingsService } from '../settings/settings.service';

@Injectable()
export class EmailService {
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
        sentAt: sentStatus === 'SENT' ? new Date() : null,
      },
    });
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
