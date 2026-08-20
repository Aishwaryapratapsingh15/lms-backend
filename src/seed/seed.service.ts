import { Injectable, OnModuleInit } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SeedService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    const hashedPassword = await bcrypt.hash('admin123', 10);

    // Create/Update Users
    const superAdmin = await this.prisma.user.upsert({
      where: { email: 'superadmin@lms.com' },
      update: {
        name: 'Super Admin',
        role: 'SUPER_ADMIN',
        isActive: true,
      },
      create: {
        name: 'Super Admin',
        email: 'superadmin@lms.com',
        password: hashedPassword,
        role: 'SUPER_ADMIN',
      },
    });

    const admin = await this.prisma.user.upsert({
      where: { email: 'admin@lms.com' },
      update: {
        name: 'Admin User',
        role: 'ADMIN',
        isActive: true,
      },
      create: {
        name: 'Admin User',
        email: 'admin@lms.com',
        password: hashedPassword,
        role: 'ADMIN',
      },
    });

    const salesperson1 = await this.prisma.user.upsert({
      where: { email: 'sales1@lms.com' },
      update: {
        name: 'John Sales',
        role: 'SALES',
        isActive: true,
      },
      create: {
        name: 'John Sales',
        email: 'sales1@lms.com',
        password: hashedPassword,
        role: 'SALES',
      },
    });

    const salesperson2 = await this.prisma.user.upsert({
      where: { email: 'sales2@lms.com' },
      update: {
        name: 'Sarah Sales',
        role: 'SALES',
        isActive: true,
      },
      create: {
        name: 'Sarah Sales',
        email: 'sales2@lms.com',
        password: hashedPassword,
        role: 'SALES',
      },
    });

    // Create/Update Dummy Leads
    const leads = [
      {
        fullName: 'Acme Corporation',
        email: 'contact@acme.com',
        phone: '555-0001',
        company: 'Acme Corp',
        source: 'WEBSITE' as const,
        status: 'NEW' as const,
        priority: 'HIGH' as const,
        assignedToId: salesperson1.id,
        createdById: superAdmin.id,
      },
      {
        fullName: 'Tech Innovations Ltd',
        email: 'sales@techinnov.com',
        phone: '555-0002',
        company: 'Tech Innovations',
        source: 'CALL' as const,
        status: 'CONTACTED' as const,
        priority: 'MEDIUM' as const,
        assignedToId: salesperson1.id,
        createdById: admin.id,
      },
      {
        fullName: 'Global Solutions Inc',
        email: 'info@globalsol.com',
        phone: '555-0003',
        company: 'Global Solutions',
        source: 'REFERENCE' as const,
        status: 'QUALIFIED' as const,
        priority: 'HIGH' as const,
        assignedToId: salesperson2.id,
        createdById: superAdmin.id,
      },
      {
        fullName: 'Future Systems Co',
        email: 'contact@futuresys.com',
        phone: '555-0004',
        company: 'Future Systems',
        source: 'EMAIL' as const,
        status: 'PROPOSAL' as const,
        priority: 'MEDIUM' as const,
        assignedToId: salesperson2.id,
        createdById: admin.id,
      },
      {
        fullName: 'Digital Ventures',
        email: 'hello@digitalventures.io',
        phone: '555-0005',
        company: 'Digital Ventures',
        source: 'WEBSITE' as const,
        status: 'PROJECT_IS_OURS' as const,
        priority: 'HIGH' as const,
        assignedToId: salesperson1.id,
        createdById: superAdmin.id,
      },
      {
        fullName: 'CloudFirst Technologies',
        email: 'team@cloudfirst.com',
        phone: '555-0006',
        company: 'CloudFirst',
        source: 'CALL' as const,
        status: 'NEW' as const,
        priority: 'LOW' as const,
        assignedToId: null,
        createdById: admin.id,
      },
    ];

    for (const lead of leads) {
      const existing = await this.prisma.lead.findFirst({
        where: { email: lead.email },
      });

      if (existing) {
        await this.prisma.lead.update({
          where: { id: existing.id },
          data: lead,
        });
      } else {
        await this.prisma.lead.create({
          data: lead,
        });
      }
    }

    console.log('✅ Seed data created/updated: 3 users + 6 leads');
  }
}
