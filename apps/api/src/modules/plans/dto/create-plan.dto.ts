import { IsString, IsNotEmpty, IsOptional, IsNumber, IsBoolean, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePlanDto {
  @ApiProperty({ example: 'Basic' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: 'Home fiber plan' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: '10 Mbps' })
  @IsString()
  @IsNotEmpty()
  speed: string;

  @ApiProperty({ example: 30 })
  @IsNumber()
  @Min(1)
  durationDays: number;

  @ApiProperty({ example: 25 })
  @IsNumber()
  @Min(0)
  price: number;

  @ApiPropertyOptional({ example: 'USD', default: 'USD' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}