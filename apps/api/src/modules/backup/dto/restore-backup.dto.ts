import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RestoreBackupDto {
  @ApiProperty({ example: 'CONFIRM_RESTORE' })
  @IsString()
  @IsNotEmpty()
  confirmationToken: string;

  @ApiProperty({ description: 'Time-limited restore token' })
  @IsString()
  @IsNotEmpty()
  restoreToken: string;
}
