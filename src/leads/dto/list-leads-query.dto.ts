import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { LeadPriority, LeadSource, LeadStatus, LeadType } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class ListLeadsQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page = 1;

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit = 20;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ enum: LeadStatus })
  @IsEnum(LeadStatus)
  @IsOptional()
  status?: LeadStatus;

  @ApiPropertyOptional({ enum: LeadSource })
  @IsEnum(LeadSource)
  @IsOptional()
  source?: LeadSource;

  @ApiPropertyOptional({ enum: LeadPriority })
  @IsEnum(LeadPriority)
  @IsOptional()
  priority?: LeadPriority;

  @ApiPropertyOptional({ enum: LeadType })
  @IsEnum(LeadType)
  @IsOptional()
  leadType?: LeadType;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  assignedToId?: string;

  @ApiPropertyOptional({
    enum: ['active', 'archived', 'all'],
    default: 'active',
  })
  @IsIn(['active', 'archived', 'all'])
  @IsOptional()
  archived: 'active' | 'archived' | 'all' = 'active';

  // Once a lead is moved to Prospect it leaves the main Leads list — "exclude"
  // is the default so /leads keeps behaving exactly as it did before this
  // existed; the Prospects page is the only caller that passes "only".
  @ApiPropertyOptional({
    enum: ['exclude', 'only', 'all'],
    default: 'exclude',
  })
  @IsIn(['exclude', 'only', 'all'])
  @IsOptional()
  prospect: 'exclude' | 'only' | 'all' = 'exclude';

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  createdFrom?: string;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  createdTo?: string;

  // Filters by when a lead was moved to Prospect, not when it was created —
  // the Prospects page's month picker uses these instead of createdFrom/To.
  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  prospectedFrom?: string;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  prospectedTo?: string;
}
