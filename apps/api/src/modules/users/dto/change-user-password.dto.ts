import { IsString, IsNotEmpty, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ChangeUserPasswordDto {
  @ApiProperty({ example: 'NewPass123!' })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  newPassword: string;
}