import { IsString, IsNotEmpty, IsOptional, IsDateString, IsInt, Min, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateSubscriptionDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  customerId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  planId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'Overrides plan durationDays' })
  @IsOptional()
  @IsInt()
  @Min(1)
  durationDays?: number;

  @ApiPropertyOptional({ enum: ['paid', 'pending', 'partially_paid'], default: 'paid' })
  @IsOptional()
  @IsString()
  @IsIn(['paid', 'pending', 'partially_paid'])
  paymentStatus?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}