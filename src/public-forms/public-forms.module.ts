import { Module } from '@nestjs/common';
import { PublicFormsController } from './public-forms.controller';
import { PublicFormsService } from './public-forms.service';
import { FormSubmissionsController } from './form-submissions.controller';
import { RateLimitGuard } from '../common/guards/rate-limit.guard';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [PublicFormsController, FormSubmissionsController],
  providers: [PublicFormsService, RateLimitGuard],
})
export class PublicFormsModule {}
