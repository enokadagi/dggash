import { IsOptional, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

export class QueryUserDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ['ADMIN', 'STAFF'] })
  @IsOptional()
  @IsEnum(['ADMIN', 'STAFF'])
  role?: 'ADMIN' | 'STAFF';

  @ApiPropertyOptional({ enum: ['ACTIVE', 'INACTIVE', 'SUSPENDED'] })
  @IsOptional()
  @IsEnum(['ACTIVE', 'INACTIVE', 'SUSPENDED'])
  status?: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
}