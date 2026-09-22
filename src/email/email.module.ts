import { Module } from '@nestjs/common';
import { EmailController } from './email.controller';
import { EmailService } from './email.service';
import { InboundEmailService } from './inbound-email.service';
import { SettingsModule } from '../settings/settings.module';
import { RateLimitGuard } from '../common/guards/rate-limit.guard';

@Module({
  imports: [SettingsModule],
  controllers: [EmailController],
  providers: [EmailService, InboundEmailService, RateLimitGuard],
  exports: [EmailService],
})
export class EmailModule {}
