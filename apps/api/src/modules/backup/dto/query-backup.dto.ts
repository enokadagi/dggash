import { IsOptional, IsString, IsIn } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

export class QueryBackupDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ['full', 'incremental'], description: 'Filter by backup type' })
  @IsOptional()
  @IsString()
  @IsIn(['full', 'incremental'])
  type?: string;
}
