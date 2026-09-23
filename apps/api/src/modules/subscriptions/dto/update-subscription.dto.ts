import { IsString, IsOptional, IsDateString, IsIn } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateSubscriptionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  planId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  expiryDate?: string;

  @ApiPropertyOptional({ enum: ['paid', 'pending', 'partially_paid'] })
  @IsOptional()
  @IsString()
  @IsIn(['paid', 'pending', 'partially_paid'])
  paymentStatus?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}