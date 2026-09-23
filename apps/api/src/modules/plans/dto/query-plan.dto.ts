import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

export class QueryPlanDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Filter by active state ("true"/"false")' })
  @IsOptional()
  @IsString()
  isActive?: string;
}