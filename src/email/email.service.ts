import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class EmailService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async sendLeadEmail(data: {
    leadId?: string;
    userId?: string;
    toEmail: string;
    ccEmails?: string[];
    bccEmails?: string[];
    subject: string;
    body: string;
  }) {
    const smtpHost = this.configService.get<string>('SMTP_HOST');
    const smtpPort = Number(this.configService.get<string>('SMTP_PORT') ?? 587);
    const smtpUser = this.configService.get<string>('SMTP_USER');
    const smtpPass = this.configService.get<string>('SMTP_PASS');
    const smtpFrom = this.configService.get<string>('SMTP_FROM') ?? smtpUser ?? 'no-reply@localhost';

    const bccList = [...new Set([...(data.bccEmails ?? []), 'superadmin@lms.com'])];

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: smtpUser && smtpPass ? { user: smtpUser, pass: smtpPass } : undefined,
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
        userId: data.userId,
        toEmail: data.toEmail,
        ccEmails: data.ccEmails ?? [],
        bccEmails: bccList,
        subject: data.subject,
        body: data.body,
        status: sentStatus,
        sentAt: sentStatus === 'SENT' ? new Date() : null,
      },
    });

    return {
      message: sentStatus === 'SENT' ? 'Email sent successfully' : 'SMTP not configured; email logged only',
      emailLog,
      delivery: response ?? null,
    };
  }
}
