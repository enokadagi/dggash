import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateSettingDto {
  @ApiProperty({ example: { enabled: true } })
  @IsNotEmpty()
  value: any;

  @ApiPropertyOptional({ example: 'general' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ example: 'Enable notifications' })
  @IsOptional()
  @IsString()
  description?: string;
}
