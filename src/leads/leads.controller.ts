import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { LeadsService } from './leads.service';
import { CreateLeadDto } from './dto/create-lead.dto';
import { AssignLeadDto } from './dto/assign-lead.dto';
import { UpdateLeadStatusDto } from './dto/update-lead-status.dto';
import { FollowUpDto } from './dto/follow-up.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@ApiTags('Leads')
@ApiBearerAuth()
@Controller('leads')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Post()
  @Roles('SUPER_ADMIN', 'ADMIN')
  @ApiOperation({ summary: 'Create a new lead' })
  createLead(@Body() createLeadDto: CreateLeadDto) {
    return this.leadsService.createLead(createLeadDto);
  }

  @Get('dashboard')
  @Roles('SUPER_ADMIN', 'ADMIN', 'SALES')
  @ApiOperation({ summary: 'Get lead dashboard metrics and counts' })
  getDashboard() {
    return this.leadsService.dashboardSummary();
  }

  @Get()
  @Roles('SUPER_ADMIN', 'ADMIN', 'SALES')
  @ApiOperation({ summary: 'List all leads' })
  findAll() {
    return this.leadsService.findAll();
  }

  @Get(':id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'SALES')
  @ApiOperation({ summary: 'Get a single lead with follow-ups and emails' })
  findOne(@Param('id') id: string) {
    return this.leadsService.findOne(id);
  }

  @Patch(':id/assign')
  @Roles('SUPER_ADMIN', 'ADMIN')
  @ApiOperation({ summary: 'Assign a lead to a specific sales user' })
  assignLead(@Param('id') id: string, @Body() dto: AssignLeadDto) {
    return this.leadsService.assignLead(id, dto.assignedToId);
  }

  @Patch(':id/status')
  @Roles('SUPER_ADMIN', 'ADMIN', 'SALES')
  @ApiOperation({ summary: 'Update lead status' })
  updateStatus(@Param('id') id: string, @Body() dto: UpdateLeadStatusDto) {
    return this.leadsService.updateStatus(id, dto.status);
  }

  @Post('follow-up')
  @Roles('SUPER_ADMIN', 'ADMIN', 'SALES')
  @ApiOperation({ summary: 'Create a follow-up entry for the lead' })
  addFollowUp(@Body() dto: FollowUpDto) {
    return this.leadsService.addFollowUp(dto);
  }
}
