import { ApiPropertyOptional } from '@nestjs/swagger';
import { VendorEventAttendance } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateVendorEventDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  productName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  eventDate?: string;

  @ApiPropertyOptional({ enum: VendorEventAttendance })
  @IsOptional()
  @IsEnum(VendorEventAttendance)
  attendance?: VendorEventAttendance;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
