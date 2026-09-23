import { Type } from 'class-transformer';
import {
  IsString, IsNotEmpty, IsOptional, IsInt, Min, IsArray, ValidateNested, IsIn,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateSaleItemDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  productId: string;

  @ApiProperty({ example: 2 })
  @IsInt()
  @Min(1)
  quantity: number;
}

export class CreateSaleDto {
  @ApiProperty({ type: [CreateSaleItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSaleItemDto)
  items: CreateSaleItemDto[];

  @ApiPropertyOptional({ description: 'Optional customer (walk-in if omitted)' })
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiProperty({ enum: ['cash', 'card', 'bank_transfer', 'credit', 'other'], example: 'cash' })
  @IsString()
  @IsNotEmpty()
  @IsIn(['cash', 'card', 'bank_transfer', 'credit', 'other'])
  paymentMethod: string;

  @ApiPropertyOptional({ example: 'USD', default: 'USD' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}