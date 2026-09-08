import { ApiProperty } from '@nestjs/swagger';
import { VendorEventAttendance } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateVendorEventDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  productName!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  eventDate?: string;

  @ApiProperty({ enum: VendorEventAttendance, required: false })
  @IsOptional()
  @IsEnum(VendorEventAttendance)
  attendance?: VendorEventAttendance;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string;
}
