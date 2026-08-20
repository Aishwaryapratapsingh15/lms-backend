import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PublicFormsService } from './public-forms.service';

@ApiTags('Form Submissions')
@ApiBearerAuth()
@Controller('form-submissions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FormSubmissionsController {
  constructor(private readonly publicFormsService: PublicFormsService) {}

  @Get()
  @Roles('SUPER_ADMIN', 'ADMIN')
  @ApiOperation({ summary: 'List general website enquiries for the admin UI' })
  findAll() {
    return this.publicFormsService.listGeneralEnquiries();
  }
}
