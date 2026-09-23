import { IsOptional, IsString, IsInt, Min, Max } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CursorPaginationDto {
  @ApiPropertyOptional({ description: 'Cursor for next page' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number = 20;
}

export class CursorPaginatedResponse<T> {
  data: T[];
  nextCursor: string | null;
  hasMore: boolean;

  constructor(data: T[], nextCursor: string | null, hasMore: boolean) {
    this.data = data;
    this.nextCursor = nextCursor;
    this.hasMore = hasMore;
  }
}
