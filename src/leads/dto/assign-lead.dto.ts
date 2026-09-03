import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class AssignLeadDto {
  @ApiProperty({ nullable: true, description: 'Send null or an empty string to unassign the lead' })
  @Transform(({ value }) => (value === '' ? null : value))
  @IsOptional()
  @IsUUID()
  assignedToId!: string | null;
}
