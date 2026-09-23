import { IsOptional, IsString, IsIn } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

export class QueryWhatsAppDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ['pending', 'sent', 'delivered', 'read', 'failed'] })
  @IsOptional()
  @IsIn(['pending', 'sent', 'delivered', 'read', 'failed'])
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  dateFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  dateTo?: string;

  @ApiPropertyOptional({ description: 'Reminder type filter (DAYS_5, DAYS_3, DAYS_1, EXPIRY_DAY)' })
  @IsOptional()
  @IsIn(['DAYS_5', 'DAYS_3', 'DAYS_1', 'EXPIRY_DAY'])
  reminderType?: string;
}