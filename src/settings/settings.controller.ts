import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SettingsService } from './settings.service';
import { UpdateEmailSettingsDto } from './dto/update-email-settings.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RequestWithUser } from '../common/interfaces/request-with-user.interface';

@ApiTags('Settings')
@ApiBearerAuth()
@Controller('settings')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get('email')
  @Roles('SUPER_ADMIN')
  @ApiOperation({
    summary: 'Get the company-wide default CC/BCC addresses for lead emails',
  })
  getEmailSettings() {
    return this.settingsService.getEmailSettings();
  }

  @Patch('email')
  @Roles('SUPER_ADMIN')
  @ApiOperation({
    summary: 'Update the company-wide default CC/BCC addresses for lead emails',
  })
  updateEmailSettings(
    @Body() dto: UpdateEmailSettingsDto,
    @Req() req: RequestWithUser,
  ) {
    return this.settingsService.updateEmailSettings(dto, req.user.id);
  }
}
