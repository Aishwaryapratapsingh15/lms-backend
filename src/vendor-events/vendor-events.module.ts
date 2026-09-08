import { Module } from '@nestjs/common';
import { VendorEventsController } from './vendor-events.controller';
import { VendorEventsService } from './vendor-events.service';

@Module({
  controllers: [VendorEventsController],
  providers: [VendorEventsService],
})
export class VendorEventsModule {}
