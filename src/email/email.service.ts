import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '../prisma/prisma.service';
import { LeadActivityType, Role } from '@prisma/client';

@Injectable()
export class EmailService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
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

    const bccList = [
      ...new Set([...(data.bccEmails ?? []), 'superadmin@lms.com']),
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
        cc: data.ccEmails ?? [],
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
        ccEmails: data.ccEmails ?? [],
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
