import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class ListUsersQueryDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  search?: string;
}
