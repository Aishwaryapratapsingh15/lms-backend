import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class MarkProspectDto {
  @ApiProperty({ description: 'Why this lead is being moved to Prospect' })
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  reason!: string;
}
