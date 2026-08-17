import { Injectable, OnModuleInit } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SeedService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    const superAdminEmail = 'superadmin@lms.com';
    const hashedPassword = await bcrypt.hash('admin123', 10);

    await this.prisma.user.upsert({
      where: { email: superAdminEmail },
      update: {
        name: 'Super Admin',
        role: 'SUPER_ADMIN',
        isActive: true,
      },
      create: {
        name: 'Super Admin',
        email: superAdminEmail,
        password: hashedPassword,
        role: 'SUPER_ADMIN',
      },
    });
  }
}
