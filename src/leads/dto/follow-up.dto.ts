import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { FollowUpType } from '@prisma/client';

export class FollowUpDto {
  @ApiProperty()
  @IsString()
  leadId!: string;

  @ApiProperty({ enum: FollowUpType })
  @IsEnum(FollowUpType)
  type!: FollowUpType;

  @ApiProperty()
  @IsString()
  notes!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  nextFollowUpAt?: string;
}
