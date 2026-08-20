import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { LeadsService } from './leads.service';
import { CreateLeadDto } from './dto/create-lead.dto';
import { AssignLeadDto } from './dto/assign-lead.dto';
import { UpdateLeadStatusDto } from './dto/update-lead-status.dto';
import { FollowUpDto } from './dto/follow-up.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RequestWithUser } from '../common/interfaces/request-with-user.interface';
import { DashboardQueryDto } from './dto/dashboard-query.dto';
import { ListLeadsQueryDto } from './dto/list-leads-query.dto';
import { RemindersQueryDto } from './dto/reminders-query.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';

@ApiTags('Leads')
@ApiBearerAuth()
@Controller('leads')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Post()
  @Roles('SUPER_ADMIN', 'ADMIN')
  @ApiOperation({ summary: 'Create a new lead' })
  createLead(
    @Body() createLeadDto: CreateLeadDto,
    @Req() req: RequestWithUser,
  ) {
    return this.leadsService.createLead(createLeadDto, req.user);
  }

  @Get('dashboard')
  @Roles('SUPER_ADMIN', 'ADMIN', 'SALES')
  @ApiOperation({ summary: 'Get lead dashboard metrics and counts' })
  getDashboard(@Query() query: DashboardQueryDto, @Req() req: RequestWithUser) {
    return this.leadsService.dashboardSummary(query, req.user);
  }

  @Get('reminders')
  @Roles('SUPER_ADMIN', 'ADMIN', 'SALES')
  @ApiOperation({
    summary: 'List overdue, today, or upcoming follow-up reminders',
  })
  reminders(@Query() query: RemindersQueryDto, @Req() req: RequestWithUser) {
    return this.leadsService.reminders(query, req.user);
  }

  @Get()
  @Roles('SUPER_ADMIN', 'ADMIN', 'SALES')
  @ApiOperation({ summary: 'List all leads' })
  findAll(@Query() query: ListLeadsQueryDto, @Req() req: RequestWithUser) {
    return this.leadsService.findAll(query, req.user);
  }

  @Patch('follow-ups/:id/complete')
  @Roles('SUPER_ADMIN', 'ADMIN', 'SALES')
  @ApiOperation({ summary: 'Mark a follow-up reminder complete' })
  completeFollowUp(@Param('id') id: string, @Req() req: RequestWithUser) {
    return this.leadsService.completeFollowUp(id, req.user);
  }

  @Get(':id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'SALES')
  @ApiOperation({ summary: 'Get a single lead with follow-ups and emails' })
  findOne(@Param('id') id: string, @Req() req: RequestWithUser) {
    return this.leadsService.findOne(id, req.user);
  }

  @Get(':id/timeline')
  @Roles('SUPER_ADMIN', 'ADMIN', 'SALES')
  @ApiOperation({ summary: 'Get the lead audit and activity timeline' })
  timeline(@Param('id') id: string, @Req() req: RequestWithUser) {
    return this.leadsService.timeline(id, req.user);
  }

  @Patch(':id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'SALES')
  @ApiOperation({ summary: 'Update lead details' })
  updateLead(
    @Param('id') id: string,
    @Body() dto: UpdateLeadDto,
    @Req() req: RequestWithUser,
  ) {
    return this.leadsService.updateLead(id, dto, req.user);
  }

  @Patch(':id/assign')
  @Roles('SUPER_ADMIN', 'ADMIN')
  @ApiOperation({ summary: 'Assign a lead to a specific sales user' })
  assignLead(
    @Param('id') id: string,
    @Body() dto: AssignLeadDto,
    @Req() req: RequestWithUser,
  ) {
    return this.leadsService.assignLead(id, dto.assignedToId, req.user);
  }

  @Patch(':id/status')
  @Roles('SUPER_ADMIN', 'ADMIN', 'SALES')
  @ApiOperation({ summary: 'Update lead status' })
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateLeadStatusDto,
    @Req() req: RequestWithUser,
  ) {
    return this.leadsService.updateStatus(id, dto.status, req.user);
  }

  @Post('follow-up')
  @Roles('SUPER_ADMIN', 'ADMIN', 'SALES')
  @ApiOperation({ summary: 'Create a follow-up entry for the lead' })
  addFollowUp(@Body() dto: FollowUpDto, @Req() req: RequestWithUser) {
    return this.leadsService.addFollowUp(dto, req.user);
  }

  @Patch(':id/archive')
  @Roles('SUPER_ADMIN', 'ADMIN')
  @ApiOperation({ summary: 'Archive a lead without deleting it' })
  archive(@Param('id') id: string, @Req() req: RequestWithUser) {
    return this.leadsService.archive(id, req.user);
  }

  @Patch(':id/restore')
  @Roles('SUPER_ADMIN', 'ADMIN')
  @ApiOperation({ summary: 'Restore an archived lead' })
  restore(@Param('id') id: string, @Req() req: RequestWithUser) {
    return this.leadsService.archive(id, req.user, true);
  }
}
