import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SaveWhatsAppTemplateDto {
  @ApiProperty({ example: 'reminder_5d', description: 'Template name — stored under whatsapp.<name>' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'Hi {{firstName}}, your plan expires on {{expiryDate}}.' })
  @IsString()
  @IsNotEmpty()
  body: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
}