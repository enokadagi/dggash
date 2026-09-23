import { IsString, IsNotEmpty, IsOptional, IsNumber, IsIn, Min, ValidateIf } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateStockMovementDto {
  @ApiProperty({ enum: ['PURCHASE', 'RETURN', 'ADJUSTMENT', 'DAMAGED', 'LOST', 'CORRECTION'], example: 'PURCHASE' })
  @IsString()
  @IsNotEmpty()
  @IsIn(['PURCHASE', 'RETURN', 'ADJUSTMENT', 'DAMAGED', 'LOST', 'CORRECTION'])
  movementType: string;

  @ApiProperty({
    example: 10,
    description:
      'Quantity. Must be positive for PURCHASE/RETURN/SALE/DAMAGED/LOST. ' +
      'For ADJUSTMENT and CORRECTION use a signed value (+increase, -decrease) and it must be non-zero.',
  })
  @IsNumber()
  @ValidateIf((o) => !['ADJUSTMENT', 'CORRECTION'].includes(o.movementType))
  @Min(1)
  @IsNotEmpty()
  quantity: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reference?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}