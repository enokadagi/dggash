import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SaveWhatsAppTemplateDto {
  @ApiPropertyOptional({ example: 'whatsapp.reminder_5d_template', description: 'Existing template key to update in place (avoids creating a duplicate when the name changes)' })
  @IsOptional()
  @IsString()
  key?: string;

  @ApiProperty({ example: 'reminder_5d', description: 'Template name — stored under whatsapp.<name> when no key is given' })
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