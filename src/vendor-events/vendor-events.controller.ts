import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { VendorEventsService } from './vendor-events.service';
import { CreateVendorEventDto } from './dto/create-vendor-event.dto';
import { UpdateVendorEventDto } from './dto/update-vendor-event.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RequestWithUser } from '../common/interfaces/request-with-user.interface';

@ApiTags('Vendor Events')
@ApiBearerAuth()
@Controller('vendor-events')
@UseGuards(JwtAuthGuard, RolesGuard)
export class VendorEventsController {
  constructor(private readonly vendorEventsService: VendorEventsService) {}

  @Post()
  @Roles('SUPER_ADMIN', 'ADMIN')
  @ApiOperation({ summary: 'Log a vendor product briefing/training event' })
  create(@Body() dto: CreateVendorEventDto, @Req() req: RequestWithUser) {
    return this.vendorEventsService.create(dto, req.user.id);
  }

  @Get()
  @Roles('SUPER_ADMIN', 'ADMIN', 'SALES')
  @ApiOperation({ summary: 'List vendor product briefing/training events' })
  list() {
    return this.vendorEventsService.list();
  }

  @Patch(':id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  @ApiOperation({ summary: 'Update a vendor event' })
  update(@Param('id') id: string, @Body() dto: UpdateVendorEventDto) {
    return this.vendorEventsService.update(id, dto);
  }

  @Delete(':id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  @ApiOperation({ summary: 'Delete a vendor event' })
  remove(@Param('id') id: string) {
    return this.vendorEventsService.remove(id);
  }
}
