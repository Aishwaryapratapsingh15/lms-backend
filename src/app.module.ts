import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { LeadsModule } from './leads/leads.module';
import { EmailModule } from './email/email.module';
import { SeedModule } from './seed/seed.module';
import { PublicFormsModule } from './public-forms/public-forms.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    UsersModule,
    LeadsModule,
    EmailModule,
    SeedModule,
    PublicFormsModule,
  ],
})
export class AppModule {}
