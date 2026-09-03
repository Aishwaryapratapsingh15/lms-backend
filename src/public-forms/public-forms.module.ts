import { Module } from '@nestjs/common';
import { PublicFormsController } from './public-forms.controller';
import { PublicFormsService } from './public-forms.service';
import { FormSubmissionsController } from './form-submissions.controller';
import { RateLimitGuard } from '../common/guards/rate-limit.guard';
import { NotificationsModule } from '../notifications/notifications.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [NotificationsModule, EmailModule],
  controllers: [PublicFormsController, FormSubmissionsController],
  providers: [PublicFormsService, RateLimitGuard],
})
export class PublicFormsModule {}
