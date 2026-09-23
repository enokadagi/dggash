import { IsString, IsNotEmpty, IsOptional, IsObject } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SendTemplateDto {
  @ApiPropertyOptional({ description: 'Customer id (resolves the recipient phone if phone is omitted)' })
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiPropertyOptional({ example: '+96170000000' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ example: 'whatsapp.reminder_1d_template', description: 'CompanySetting key holding the template body' })
  @IsString()
  @IsNotEmpty()
  templateKey: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  variables?: Record<string, string>;
}