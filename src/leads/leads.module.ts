import { Module } from '@nestjs/common';
import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';
import { CalendarModule } from '../calendar/calendar.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { EmailModule } from '../email/email.module';
import { LeadSlaService } from './lead-sla.service';

@Module({
  imports: [CalendarModule, NotificationsModule, EmailModule],
  controllers: [LeadsController],
  providers: [LeadsService, LeadSlaService],
  exports: [LeadsService],
})
export class LeadsModule {}
