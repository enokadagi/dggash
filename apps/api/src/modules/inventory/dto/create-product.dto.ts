import { IsString, IsNotEmpty, IsOptional, IsNumber, IsBoolean, IsInt, Min, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateProductDto {
  @ApiProperty({ example: 'MikroTik hAP ac2' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'MIK-HAPAC2' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[A-Za-z0-9\-_]+$/, { message: 'SKU can only contain letters, numbers, dashes and underscores' })
  sku: string;

  @ApiPropertyOptional({ example: '2000000013377' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  barcode?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  categoryId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiProperty({ example: 45 })
  @IsNumber()
  @Min(0)
  purchasePrice: number;

  @ApiProperty({ example: 65 })
  @IsNumber()
  @Min(0)
  sellingPrice: number;

  @ApiPropertyOptional({ example: 'USD', default: 'USD' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ default: 0, description: 'Opening stock. Creates a PURCHASE movement.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  initialStock?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  initialStockNote?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  minStock?: number;

  @ApiPropertyOptional({ example: 'piece', default: 'piece' })
  @IsOptional()
  @IsString()
  unit?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}