import { createHmac, randomInt } from 'crypto';
import {
  HttpException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '../prisma/prisma.service';
import { ContactSubmissionDto } from './dto/contact-submission.dto';
import { SendOtpDto } from './dto/send-otp.dto';
import { SubmitPublicFormDto } from './dto/submit-public-form.dto';

@Injectable()
export class PublicFormsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async sendOtp(dto: SendOtpDto) {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.publicEmailOtp.findUnique({
      where: { email },
    });
    const cooldownSeconds = Number(
      this.config.get('PUBLIC_OTP_RESEND_SECONDS') ?? 60,
    );

    if (
      existing &&
      Date.now() - existing.lastSentAt.getTime() < cooldownSeconds * 1000
    ) {
      throw new HttpException(
        {
          status: 429,
          message: `Please wait ${cooldownSeconds} seconds before requesting another OTP`,
        },
        429,
      );
    }

    const otp = randomInt(100000, 1000000).toString();
    const ttlMinutes = Number(this.config.get('PUBLIC_OTP_TTL_MINUTES') ?? 10);

    await this.sendMail({
      to: email,
      subject: 'Your One-Time Password (OTP)',
      html: this.otpEmailHtml(otp),
      text: `Your OTP is ${otp}. It is valid for ${ttlMinutes} minutes.`,
    });

    await this.prisma.publicEmailOtp.upsert({
      where: { email },
      create: {
        email,
        otpHash: this.hashOtp(email, otp),
        expiresAt: new Date(Date.now() + ttlMinutes * 60_000),
      },
      update: {
        otpHash: this.hashOtp(email, otp),
        expiresAt: new Date(Date.now() + ttlMinutes * 60_000),
        lastSentAt: new Date(),
      },
    });

    return { status: 200, message: 'OTP sent successfully', email };
  }

  async clearOtp(rawEmail: string) {
    const email = rawEmail.trim().toLowerCase();
    await this.prisma.publicEmailOtp.deleteMany({ where: { email } });
    return { status: 200, message: 'OTP cleared successfully' };
  }

  async submitVerifiedForm(dto: SubmitPublicFormDto) {
    const email = dto.email.trim().toLowerCase();
    const storedOtp = await this.prisma.publicEmailOtp.findUnique({
      where: { email },
    });

    if (
      !storedOtp ||
      storedOtp.expiresAt.getTime() < Date.now() ||
      storedOtp.otpHash !== this.hashOtp(email, dto.otp.trim())
    ) {
      throw new HttpException(
        { status: 400, message: 'OTP verification failed' },
        400,
      );
    }

    const submission = await this.prisma.$transaction(async (tx) => {
      const created = await tx.publicFormSubmission.create({
        data: {
          name: this.optional(dto.name),
          email,
          contact: this.optional(dto.contact),
          service: this.optional(dto.product),
          message: this.optional(dto.message),
        },
      });
      await tx.publicEmailOtp.delete({ where: { email } });
      return created;
    });

    try {
      const name = this.optional(dto.name) ?? 'Website visitor';
      await this.sendMail({
        to: this.recipientList(
          'PUBLIC_ENQUIRY_TO',
          'HR@EICETECHNOLOGY.COM,harshita.chaurasiya@eicetechnology.com',
        ),
        subject: `User Message from ${name}`,
        html: this.enquiryEmailHtml(dto),
        text: `User Query - Name: ${name}, Email: ${email}, Contact: ${dto.contact ?? ''}, Message: ${dto.message ?? ''}`,
      });
    } catch (error) {
      throw new InternalServerErrorException({
        status: 500,
        message: 'User data stored, but email sending failed',
        submissionId: submission.id,
      });
    }

    return {
      status: 200,
      message: 'User data stored, email sent successfully',
      email_verified: true,
      submissionId: submission.id,
    };
  }

  async submitContact(dto: ContactSubmissionDto) {
    const email = dto.email.trim().toLowerCase();
    const submission = await this.prisma.$transaction(async (tx) => {
      const created = await tx.contactSubmission.create({
        data: {
          name: dto.name.trim(),
          companyName: dto.companyName.trim(),
          role: this.optional(dto.role),
          email,
          phone: dto.phone.trim(),
          phoneCode: dto.phoneCode.trim(),
          country: this.optional(dto.country),
          address: dto.address.trim(),
          requirement: dto.requirement.trim(),
          product: this.optional(dto.product),
          message: this.optional(dto.message),
        },
      });
      await tx.lead.create({
        data: {
          fullName: dto.name.trim(),
          email,
          phone: `+${dto.phoneCode.trim()} ${dto.phone.trim()}`,
          company: dto.companyName.trim(),
          source: 'WEBSITE',
          notes: this.leadNotes([
            ['Form', 'Contact'],
            ['Role', dto.role],
            ['Country', dto.country],
            ['Address', dto.address],
            ['Product', dto.product],
            ['Requirement', dto.requirement],
            ['Message', dto.message],
          ]),
        },
      });
      return created;
    });

    try {
      await this.sendMail({
        to: this.recipientList(
          'PUBLIC_CONTACT_TO',
          'rahul.singh@eicetechnology.com,sameer.parashar@eicetechnology.com,amit.srivastava@eicetechnology.com',
        ),
        bcc: this.recipientList(
          'PUBLIC_CONTACT_BCC',
          'uma.tripathi@eicetechnology.com,ankit.rawat@eicetechnology.com',
        ),
        subject: `New Contact Form Submission from ${dto.name.trim()}`,
        html: this.contactEmailHtml(dto),
        text: `New contact form from ${dto.name.trim()}. Email: ${email}, Phone: +${dto.phoneCode.trim()} ${dto.phone.trim()}`,
      });
    } catch (error) {
      throw new InternalServerErrorException({
        status: 500,
        message: 'Form stored, but email failed to send.',
        submissionId: submission.id,
      });
    }

    return {
      status: 200,
      message: 'Form data stored and email sent successfully.',
      submissionId: submission.id,
    };
  }

  listGeneralEnquiries() {
    return this.prisma.publicFormSubmission.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  private async sendMail(data: {
    to: string | string[];
    bcc?: string[];
    subject: string;
    html: string;
    text: string;
  }) {
    const host = this.config.get<string>('SMTP_HOST');
    const port = Number(this.config.get('SMTP_PORT') ?? 587);
    const user = this.config.get<string>('SMTP_USER');
    const pass = this.config.get<string>('SMTP_PASS');
    const from = this.config.get<string>('SMTP_FROM') ?? user;

    if (!host || !user || !pass || !from) {
      throw new Error('SMTP is not configured');
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });

    await transporter.sendMail({ from, ...data });
  }

  private hashOtp(email: string, otp: string) {
    const secret =
      this.config.get<string>('PUBLIC_OTP_HASH_SECRET') ??
      this.config.get<string>('JWT_ACCESS_SECRET');
    if (!secret) {
      throw new Error(
        'PUBLIC_OTP_HASH_SECRET or JWT_ACCESS_SECRET must be configured',
      );
    }
    return createHmac('sha256', secret).update(`${email}:${otp}`).digest('hex');
  }

  private recipientList(key: string, fallback: string) {
    return (this.config.get<string>(key) ?? fallback)
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
  }

  private optional(value?: string) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }

  private leadNotes(entries: Array<[string, string | undefined]>) {
    return entries
      .filter(([, value]) => Boolean(value?.trim()))
      .map(([label, value]) => `${label}: ${value!.trim()}`)
      .join('\n');
  }

  private escape(value?: string) {
    return (value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  private otpEmailHtml(otp: string) {
    const minutes = Number(this.config.get('PUBLIC_OTP_TTL_MINUTES') ?? 10);
    return `<html><body style="font-family:Arial,sans-serif;background:#f4f4f4;padding:20px"><div style="max-width:600px;margin:auto;background:#fff;padding:20px;border-radius:10px;text-align:center"><h2>Email verification</h2><p>Use this one-time password to complete verification:</p><div style="font-size:24px;font-weight:bold;background:#4CAF50;color:#fff;padding:10px 20px;border-radius:5px;display:inline-block">${otp}</div><p>This OTP is valid for ${minutes} minutes.</p><p>If you did not request it, you can ignore this email.</p></div></body></html>`;
  }

  private enquiryEmailHtml(dto: SubmitPublicFormDto) {
    return `<html><body style="font-family:Arial,sans-serif"><h2>User Message</h2><p><strong>Name:</strong> ${this.escape(dto.name) || 'N/A'}</p><p><strong>Email:</strong> ${this.escape(dto.email)}</p><p><strong>Contact:</strong> ${this.escape(dto.contact) || 'N/A'}</p><p><strong>Service/Product:</strong> ${this.escape(dto.product) || 'N/A'}</p><p><strong>Message:</strong><br>${this.escape(dto.message) || 'N/A'}</p></body></html>`;
  }

  private contactEmailHtml(dto: ContactSubmissionDto) {
    const rows: Array<[string, string]> = [
      ['Name', dto.name],
      ['Company', dto.companyName],
      ['Role', dto.role ?? ''],
      ['Email', dto.email],
      ['Phone', `+${dto.phoneCode} ${dto.phone}`],
      ['Country', dto.country ?? ''],
      ['Address', dto.address],
      ['Product', dto.product ?? ''],
      ['Requirement', dto.requirement],
      ['Message', dto.message ?? ''],
    ];
    const tableRows = rows
      .map(
        ([label, value]) =>
          `<tr><th align="left">${label}</th><td>${this.escape(value)}</td></tr>`,
      )
      .join('');
    return `<html><body><h2 style="text-align:center">New Submission</h2><table style="width:100%;border-collapse:collapse" border="1">${tableRows}</table></body></html>`;
  }
}
