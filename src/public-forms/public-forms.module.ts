import { Module } from '@nestjs/common';
import { PublicFormsController } from './public-forms.controller';
import { PublicFormsService } from './public-forms.service';
import { FormSubmissionsController } from './form-submissions.controller';

@Module({
  controllers: [PublicFormsController, FormSubmissionsController],
  providers: [PublicFormsService],
})
export class PublicFormsModule {}
