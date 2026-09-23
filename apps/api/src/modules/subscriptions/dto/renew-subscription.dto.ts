import { IsString, IsOptional, IsInt, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class RenewSubscriptionDto {
  @ApiPropertyOptional({ description: 'Switch to a different plan' })
  @IsOptional()
  @IsString()
  planId?: string;

  @ApiPropertyOptional({ description: 'Overrides plan durationDays for this renewal' })
  @IsOptional()
  @IsInt()
  @Min(1)
  durationDays?: number;
}