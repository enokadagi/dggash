import { IsString, IsNotEmpty, IsOptional, IsArray, ValidateNested, IsObject } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class BulkRecipientDto {
  @ApiProperty({ example: '+96170000000' })
  @IsString()
  @IsNotEmpty()
  phone: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  variables?: Record<string, string>;
}

export class BulkSendMessageDto {
  @ApiProperty({ type: [BulkRecipientDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkRecipientDto)
  recipients: BulkRecipientDto[];

  @ApiPropertyOptional({ description: 'CompanySetting key of a saved template (e.g. whatsapp.reminder_1d_template)' })
  @IsOptional()
  @IsString()
  templateKey?: string;

  @ApiPropertyOptional({ description: 'Plain body used when no templateKey is given' })
  @IsOptional()
  @IsString()
  body?: string;
}