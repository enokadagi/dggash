import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

export class QuerySubscriptionDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ['ACTIVE', 'EXPIRING_SOON', 'EXPIRED', 'SUSPENDED'] })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  planId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiPropertyOptional({ description: 'Only subscriptions expiring within the warning window ("true")' })
  @IsOptional()
  @IsString()
  expiringSoon?: string;
}