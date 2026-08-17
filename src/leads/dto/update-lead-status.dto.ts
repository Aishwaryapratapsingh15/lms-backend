import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { LeadStatus } from '@prisma/client';

export class UpdateLeadStatusDto {
  @ApiProperty({ enum: LeadStatus })
  @IsEnum(LeadStatus)
  status!: LeadStatus;
}
