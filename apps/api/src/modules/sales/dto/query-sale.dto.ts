import { IsOptional, IsString, IsDateString, IsIn } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

export class QuerySaleDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ['COMPLETED', 'REFUNDED', 'CANCELLED'] })
  @IsOptional()
  @IsString()
  @IsIn(['COMPLETED', 'REFUNDED', 'CANCELLED'])
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiPropertyOptional({ enum: ['cash', 'card', 'bank_transfer', 'credit', 'other'] })
  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dateTo?: string;
}