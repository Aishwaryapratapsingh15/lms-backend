import { ApiProperty } from '@nestjs/swagger';
import { IsDateString } from 'class-validator';

export class CalendarQueryDto {
  @ApiProperty({ description: 'Inclusive start of the visible range (ISO 8601)' })
  @IsDateString()
  from!: string;

  @ApiProperty({ description: 'Exclusive end of the visible range (ISO 8601)' })
  @IsDateString()
  to!: string;
}
