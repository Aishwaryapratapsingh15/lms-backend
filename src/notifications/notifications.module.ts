import { Module } from '@nestjs/common';
import { TeamsNotificationService } from './teams-notification.service';

@Module({
  providers: [TeamsNotificationService],
  exports: [TeamsNotificationService],
})
export class NotificationsModule {}
