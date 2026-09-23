import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

export class QueryProductDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional({ description: 'Filter to low-stock products ("true")' })
  @IsOptional()
  @IsString()
  lowStock?: string;

  @ApiPropertyOptional({ description: 'Filter by active state ("true"/"false")' })
  @IsOptional()
  @IsString()
  isActive?: string;
}