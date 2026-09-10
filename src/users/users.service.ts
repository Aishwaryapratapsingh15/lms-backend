import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { User, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async createUser(
    data: {
      name: string;
      email: string;
      password: string;
      role: Role;
    },
    actor: { id: string; role: Role },
  ): Promise<Omit<User, 'password'>> {
    if (actor.role === Role.ADMIN && data.role !== Role.SALES) {
      throw new ForbiddenException('Admins can create sales users only');
    }
    const email = data.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing?.isActive) {
      throw new ConflictException('A user with this email already exists');
    }
    const password = await bcrypt.hash(data.password, 12);

    // A dismissed user keeps their row (and the unique email), so re-adding
    // the same email reactivates that row instead of inserting a duplicate.
    const user = existing
      ? await this.prisma.user.update({
          where: { id: existing.id },
          data: {
            name: data.name,
            password,
            role: data.role,
            isActive: true,
            sessionVersion: { increment: 1 },
          },
        })
      : await this.prisma.user.create({
          data: {
            name: data.name,
            email,
            password,
            role: data.role,
          },
        });

    const { password: _password, ...safeUser } = user;
    return safeUser;
  }

  async findAll() {
    return this.prisma.user.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });
  }

  async findById(id: string, actor: { id: string; role: Role }) {
    if (actor.role === Role.SALES && actor.id !== id)
      throw new NotFoundException('User not found');
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async dismissUser(id: string, actor: { id: string; role: Role }) {
    if (id === actor.id) {
      throw new ForbiddenException('You cannot dismiss your own account');
    }
    const target = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true, email: true, role: true, isActive: true },
    });
    if (!target?.isActive) throw new NotFoundException('Active user not found');
    if (target.role === Role.SUPER_ADMIN) {
      throw new ForbiddenException('Super Admin accounts cannot be dismissed');
    }
    if (actor.role === Role.ADMIN && target.role !== Role.SALES) {
      throw new ForbiddenException('Admins can dismiss sales users only');
    }

    const now = new Date();
    const result = await this.prisma.$transaction(async (tx) => {
      const unassigned = await tx.lead.updateMany({
        where: { assignedToId: id },
        data: {
          assignedToId: null,
          unassignedAt: now,
          slaReminderSentAt: null,
          slaEscalatedAt: null,
        },
      });
      await tx.refreshToken.updateMany({
        where: { userId: id, revoked: false },
        data: { revoked: true },
      });
      const user = await tx.user.update({
        where: { id },
        data: { isActive: false, sessionVersion: { increment: 1 } },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isActive: true,
        },
      });
      return { user, unassignedLeads: unassigned.count };
    });

    return {
      message: 'User dismissed and access revoked successfully',
      ...result,
    };
  }
}
