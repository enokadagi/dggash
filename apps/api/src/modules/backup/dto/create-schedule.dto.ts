import { IsString, IsNotEmpty, IsOptional, IsBoolean, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateScheduleDto {
  @ApiProperty({ enum: ['full', 'incremental'], example: 'full' })
  @IsString()
  @IsNotEmpty()
  type: string;

  @ApiProperty({ example: '0 2 * * *', description: 'Cron expression for schedule' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[\d\s\*\/\,\-]+$/, { message: 'Invalid cron expression' })
  cronExpression: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
