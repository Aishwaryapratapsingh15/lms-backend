import 'dotenv/config';
import * as bcrypt from 'bcryptjs';
import { PrismaClient, Role } from '@prisma/client';

const prisma = new PrismaClient();

function requiredEnvironmentVariable(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} must be set before running the admin seed`);
  }
  return value;
}

async function seedAdmin() {
  const name = process.env.INITIAL_ADMIN_NAME?.trim() || 'Super Admin';
  const email = requiredEnvironmentVariable(
    'INITIAL_ADMIN_EMAIL',
  ).toLowerCase();
  const password = requiredEnvironmentVariable('INITIAL_ADMIN_PASSWORD');

  if (password.length < 12) {
    throw new Error(
      'INITIAL_ADMIN_PASSWORD must contain at least 12 characters',
    );
  }

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    console.log(
      `User ${email} already exists with role ${existingUser.role}; no data was changed.`,
    );
    return;
  }

  const hashedPassword = await bcrypt.hash(password, 12);
  await prisma.user.create({
    data: {
      name,
      email,
      password: hashedPassword,
      role: Role.SUPER_ADMIN,
      isActive: true,
    },
  });

  console.log(`Initial SUPER_ADMIN created for ${email}.`);
}

seedAdmin()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
