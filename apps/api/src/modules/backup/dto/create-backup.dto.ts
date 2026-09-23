import { IsOptional, IsString, IsIn } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class CreateBackupDto {
  @ApiPropertyOptional({ enum: ['full', 'incremental'], default: 'full' })
  @IsOptional()
  @IsString()
  @IsIn(['full', 'incremental'])
  type?: string;
}
