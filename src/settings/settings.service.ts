import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateEmailSettingsDto } from './dto/update-email-settings.dto';

const SETTINGS_ID = 'global';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getEmailSettings() {
    const settings = await this.prisma.emailSettings.findUnique({
      where: { id: SETTINGS_ID },
    });
    return settings ?? { id: SETTINGS_ID, ccEmails: [], bccEmails: [] };
  }

  async updateEmailSettings(
    dto: UpdateEmailSettingsDto,
    actorId: string,
  ) {
    return this.prisma.emailSettings.upsert({
      where: { id: SETTINGS_ID },
      create: {
        id: SETTINGS_ID,
        ccEmails: dto.ccEmails,
        bccEmails: dto.bccEmails,
        updatedById: actorId,
      },
      update: {
        ccEmails: dto.ccEmails,
        bccEmails: dto.bccEmails,
        updatedById: actorId,
      },
    });
  }
}
