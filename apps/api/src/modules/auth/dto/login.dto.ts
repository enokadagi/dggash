import { IsString, IsNotEmpty, IsOptional, MinLength, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({
    example: '+96170000000',
    description: 'Phone number (E.164) or email address',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(254)
  identifier: string;

  @ApiProperty({ example: 'password123' })
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  @MaxLength(128)
  password: string;

  /**
   * Legacy field names, still accepted for older clients. `LocalAuthGuard`
   * folds whichever of these is present into `identifier` before passport runs,
   * so they are declared here only so the global `forbidNonWhitelisted` pipe
   * does not reject the request.
   */
  @ApiPropertyOptional({ deprecated: true })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ deprecated: true })
  @IsOptional()
  @IsString()
  email?: string;
}
