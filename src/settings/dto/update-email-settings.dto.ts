import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsEmail } from 'class-validator';

export class UpdateEmailSettingsDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(20)
  @IsEmail({}, { each: true })
  ccEmails!: string[];

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(20)
  @IsEmail({}, { each: true })
  bccEmails!: string[];
}
