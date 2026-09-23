import { IsString, IsNotEmpty, IsOptional, IsEmail, IsEnum, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateUserDto {
  @ApiProperty({ example: '+96170000001' })
  @IsString()
  @IsNotEmpty()
  phone: string;

  @ApiPropertyOptional({ example: 'staff@awik.net' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({ example: 'Rana' })
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty({ example: 'Khoury' })
  @IsString()
  @IsNotEmpty()
  lastName: string;

  @ApiProperty({ example: 'Staff123!' })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  password: string;

  @ApiPropertyOptional({ enum: ['ADMIN', 'STAFF'], default: 'STAFF' })
  @IsOptional()
  @IsEnum(['ADMIN', 'STAFF'])
  role?: 'ADMIN' | 'STAFF';

  @ApiPropertyOptional({ enum: ['ACTIVE', 'INACTIVE', 'SUSPENDED'], default: 'ACTIVE' })
  @IsOptional()
  @IsEnum(['ACTIVE', 'INACTIVE', 'SUSPENDED'])
  status?: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
}