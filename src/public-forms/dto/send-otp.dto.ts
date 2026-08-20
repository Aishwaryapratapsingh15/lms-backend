import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, MaxLength } from 'class-validator';

export class SendOtpDto {
  @ApiProperty({ example: 'person@example.com' })
  @IsEmail()
  @MaxLength(320)
  email!: string;
}
