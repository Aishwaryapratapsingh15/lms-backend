import {
  Body,
  Controller,
  Post,
  Req,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { EmailService } from './email.service';
import { SendLeadEmailDto } from './dto/send-lead-email.dto';
import { assertSafeAttachment, sanitizeFilename } from './attachment.util';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RequestWithUser } from '../common/interfaces/request-with-user.interface';
import { RateLimit } from '../common/decorators/rate-limit.decorator';
import { RateLimitGuard } from '../common/guards/rate-limit.guard';

const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;

@ApiTags('Emails')
@ApiBearerAuth()
@Controller('emails')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EmailController {
  constructor(private readonly emailService: EmailService) {}

  @Post('send')
  @Roles('SUPER_ADMIN', 'ADMIN', 'SALES')
  @UseGuards(RateLimitGuard)
  @RateLimit(300, 3600)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Send email to the lead and automatically keep admin visibility',
  })
  @UseInterceptors(
    FilesInterceptor('attachments', MAX_ATTACHMENTS, {
      limits: { fileSize: MAX_ATTACHMENT_SIZE },
    }),
  )
  sendLeadEmail(
    @Body() dto: SendLeadEmailDto,
    @Req() req: RequestWithUser,
    @UploadedFiles() attachments: Express.Multer.File[],
  ) {
    for (const file of attachments ?? []) {
      file.originalname = sanitizeFilename(file.originalname);
      assertSafeAttachment(file.originalname, file.buffer);
    }
    return this.emailService.sendLeadEmail({ ...dto, attachments }, req.user);
  }
}
