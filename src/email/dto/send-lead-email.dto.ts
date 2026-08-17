import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString } from 'class-validator';

export class SendLeadEmailDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  leadId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiProperty()
  @IsString()
  toEmail!: string;

  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  ccEmails?: string[];

  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  bccEmails?: string[];

  @ApiProperty()
  @IsString()
  subject!: string;

  @ApiProperty()
  @IsString()
  body!: string;
}
