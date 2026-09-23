import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SendMessageDto {
  @ApiProperty({ example: '+96170000000' })
  @IsString()
  @IsNotEmpty()
  recipientPhone: string;

  @ApiProperty({ example: 'Hello, this is a test message.' })
  @IsString()
  @IsNotEmpty()
  body: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiPropertyOptional({ description: 'ISO date string. If provided, the message is queued instead of sent immediately.' })
  @IsOptional()
  @IsString()
  scheduledFor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  variables?: Record<string, string>;
}