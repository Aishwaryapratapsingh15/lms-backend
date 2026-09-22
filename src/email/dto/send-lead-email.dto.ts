import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsEmail, IsOptional, IsString } from 'class-validator';

// Multipart form fields arrive as strings, not arrays — the frontend sends
// cc/bcc as a JSON-encoded array in a single field, so this unwraps that
// back into a real array before validation runs.
const toArray = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [value];
  } catch {
    return [value];
  }
};

export class SendLeadEmailDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  leadId?: string;

  @ApiProperty()
  @IsString()
  toEmail!: string;

  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @ArrayMaxSize(20)
  @IsEmail({}, { each: true })
  ccEmails?: string[];

  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @ArrayMaxSize(20)
  @IsEmail({}, { each: true })
  bccEmails?: string[];

  @ApiProperty()
  @IsString()
  subject!: string;

  @ApiProperty()
  @IsString()
  body!: string;
}
