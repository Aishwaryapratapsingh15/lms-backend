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
    if (
      await this.prisma.user.findUnique({
        where: { email },
        select: { id: true },
      })
    ) {
      throw new ConflictException('A user with this email already exists');
    }
    const password = await bcrypt.hash(data.password, 12);

    const user = await this.prisma.user.create({
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
}
