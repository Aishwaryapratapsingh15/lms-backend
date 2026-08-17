import { Injectable, NotFoundException } from '@nestjs/common';
import { LeadPriority, LeadSource, LeadStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class LeadsService {
  constructor(private readonly prisma: PrismaService) {}

  async createLead(data: {
    fullName: string;
    email?: string;
    phone?: string;
    company?: string;
    source?: LeadSource;
    status?: LeadStatus;
    priority?: LeadPriority;
    notes?: string;
    createdById?: string;
    assignedToId?: string;
  }) {
    return this.prisma.lead.create({
      data: {
        fullName: data.fullName,
        email: data.email,
        phone: data.phone,
        company: data.company,
        source: data.source ?? 'WEBSITE',
        status: data.status ?? 'NEW',
        priority: data.priority ?? 'MEDIUM',
        notes: data.notes,
        createdById: data.createdById,
        assignedToId: data.assignedToId,
      },
      include: {
        assignedTo: { select: { id: true, name: true, email: true, role: true } },
        createdBy: { select: { id: true, name: true, email: true, role: true } },
      },
    });
  }

  async assignLead(leadId: string, salesId: string) {
    const lead = await this.prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) throw new NotFoundException('Lead not found');

    return this.prisma.lead.update({
      where: { id: leadId },
      data: {
        assignedToId: salesId,
        status: 'CONTACTED',
      },
      include: {
        assignedTo: { select: { id: true, name: true, email: true, role: true } },
      },
    });
  }

  async updateStatus(leadId: string, status: LeadStatus) {
    return this.prisma.lead.update({
      where: { id: leadId },
      data: { status },
    });
  }

  async addFollowUp(data: {
    leadId: string;
    userId: string;
    type: 'CALL' | 'EMAIL' | 'MEETING' | 'NOTE';
    notes: string;
    nextFollowUpAt?: Date | string;
  }) {
    return this.prisma.leadFollowUp.create({
      data: {
        leadId: data.leadId,
        userId: data.userId,
        type: data.type,
        notes: data.notes,
        nextFollowUpAt: data.nextFollowUpAt ? new Date(data.nextFollowUpAt) : undefined,
      },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
  }

  async dashboardSummary() {
    const [totalLeads, newLeads, contacted, qualified, won, assignedWithSales] = await Promise.all([
      this.prisma.lead.count(),
      this.prisma.lead.count({ where: { status: 'NEW' } }),
      this.prisma.lead.count({ where: { status: 'CONTACTED' } }),
      this.prisma.lead.count({ where: { status: 'QUALIFIED' } }),
      this.prisma.lead.count({ where: { status: 'WON' } }),
      this.prisma.lead.count({ where: { assignedToId: { not: null } } }),
    ]);

    return {
      totalLeads,
      newLeads,
      contacted,
      qualified,
      won,
      assignedWithSales,
    };
  }

  async findAll() {
    return this.prisma.lead.findMany({
      include: {
        assignedTo: { select: { id: true, name: true, email: true, role: true } },
        createdBy: { select: { id: true, name: true, email: true, role: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const lead = await this.prisma.lead.findUnique({
      where: { id },
      include: {
        followUps: {
          orderBy: { createdAt: 'desc' },
          include: { user: { select: { id: true, name: true, email: true } } },
        },
        emailLogs: { orderBy: { createdAt: 'desc' } },
        assignedTo: { select: { id: true, name: true, email: true, role: true } },
        createdBy: { select: { id: true, name: true, email: true, role: true } },
      },
    });

    if (!lead) throw new NotFoundException('Lead not found');
    return lead;
  }
}
