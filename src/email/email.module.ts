import { Module } from '@nestjs/common';
import { EmailController } from './email.controller';
import { EmailService } from './email.service';
import { InboundEmailService } from './inbound-email.service';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [SettingsModule],
  controllers: [EmailController],
  providers: [EmailService, InboundEmailService],
  exports: [EmailService],
})
export class EmailModule {}
