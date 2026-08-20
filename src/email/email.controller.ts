import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { EmailService } from './email.service';
import { SendLeadEmailDto } from './dto/send-lead-email.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RequestWithUser } from '../common/interfaces/request-with-user.interface';

@ApiTags('Emails')
@ApiBearerAuth()
@Controller('emails')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EmailController {
  constructor(private readonly emailService: EmailService) {}

  @Post('send')
  @Roles('SUPER_ADMIN', 'ADMIN', 'SALES')
  @ApiOperation({
    summary: 'Send email to the lead and automatically keep admin visibility',
  })
  sendLeadEmail(@Body() dto: SendLeadEmailDto, @Req() req: RequestWithUser) {
    return this.emailService.sendLeadEmail(dto, req.user);
  }
}
