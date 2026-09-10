import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

export class RemindersQueryDto {
  @ApiPropertyOptional({
    enum: ['overdue', 'today', 'upcoming', 'all'],
    default: 'all',
  })
  @IsIn(['overdue', 'today', 'upcoming', 'all'])
  @IsOptional()
  range: 'overdue' | 'today' | 'upcoming' | 'all' = 'all';

  @ApiPropertyOptional({ default: 50, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit = 50;

  @ApiPropertyOptional({
    description:
      "Start of the viewer's local 'today', as an ISO instant (e.g. midnight in their timezone converted to UTC). Falls back to UTC midnight if omitted.",
  })
  @IsISO8601()
  @IsOptional()
  todayStart?: string;
}
