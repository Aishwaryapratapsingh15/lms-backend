import { Body, Controller, Delete, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ContactSubmissionDto } from './dto/contact-submission.dto';
import { SendOtpDto } from './dto/send-otp.dto';
import { SubmitPublicFormDto } from './dto/submit-public-form.dto';
import { PublicFormsService } from './public-forms.service';

@ApiTags('Public Forms')
@Controller()
export class PublicFormsController {
  constructor(private readonly publicFormsService: PublicFormsService) {}

  @Post(['public/forms/otp', 'otp.php'])
  @ApiOperation({ summary: 'Send an email verification OTP (public)' })
  sendOtp(@Body() dto: SendOtpDto) {
    return this.publicFormsService.sendOtp(dto);
  }

  @Post(['public/forms/change-email', 'changeEmail.php'])
  @ApiOperation({
    summary: 'Clear an OTP when the form email changes (public)',
  })
  clearOtp(@Body() dto: SendOtpDto) {
    return this.publicFormsService.clearOtp(dto.email);
  }

  @Delete('public/forms/otp')
  @ApiOperation({
    summary: 'Clear an OTP when the form email changes (public)',
  })
  deleteOtp(@Body() dto: SendOtpDto) {
    return this.publicFormsService.clearOtp(dto.email);
  }

  @Post(['public/forms/final-submission', 'finalsubmission.php'])
  @ApiOperation({ summary: 'Verify OTP and submit the public enquiry form' })
  submitVerifiedForm(@Body() dto: SubmitPublicFormDto) {
    return this.publicFormsService.submitVerifiedForm(dto);
  }

  @Post(['public/forms/contact', 'contact.php'])
  @ApiOperation({ summary: 'Submit the public contact form' })
  submitContact(@Body() dto: ContactSubmissionDto) {
    return this.publicFormsService.submitContact(dto);
  }
}
