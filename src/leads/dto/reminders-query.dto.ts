import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

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
}
