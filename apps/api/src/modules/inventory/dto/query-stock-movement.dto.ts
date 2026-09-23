import { IsOptional, IsString, IsDateString, IsIn } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

export class QueryStockMovementDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  productId?: string;

  @ApiPropertyOptional({ enum: ['PURCHASE', 'SALE', 'RETURN', 'ADJUSTMENT', 'DAMAGED', 'LOST', 'CORRECTION'] })
  @IsOptional()
  @IsString()
  @IsIn(['PURCHASE', 'SALE', 'RETURN', 'ADJUSTMENT', 'DAMAGED', 'LOST', 'CORRECTION'])
  movementType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dateTo?: string;
}