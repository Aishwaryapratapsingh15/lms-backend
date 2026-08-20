import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class SubmitPublicFormDto {
  @ApiProperty({ example: '123456' })
  @Transform(({ value }) =>
    typeof value === 'string' || typeof value === 'number'
      ? String(value).trim()
      : value,
  )
  @IsString()
  @Matches(/^\d{6}$/)
  otp!: string;

  @ApiProperty({ example: 'person@example.com' })
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  contact?: string;

  @ApiProperty({ name: 'product', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  product?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  message?: string;
}
