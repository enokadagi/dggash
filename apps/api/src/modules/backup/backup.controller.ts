import {
  Controller, Get, Post, Delete, Body, Param, Query, Res,
  HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { Response } from 'express';
import { createReadStream } from 'fs';
import { BackupService } from './backup.service';
import { ConfigService } from '@nestjs/config';
import { CreateBackupDto } from './dto/create-backup.dto';
import { QueryBackupDto } from './dto/query-backup.dto';
import { RestoreBackupDto } from './dto/restore-backup.dto';
import { CleanupBackupDto } from './dto/cleanup-backup.dto';
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('backup')
@ApiBearerAuth()
@Controller('backups')
export class BackupController {
  constructor(
    private readonly backupService: BackupService,
    private readonly configService: ConfigService,
  ) {}

  @Get()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'List backups with pagination' })
  @ApiResponse({ status: 200, description: 'Backups listed' })
  async findAll(@Query() query: QueryBackupDto) {
    return this.backupService.findAll(query);
  }

  @Post('create')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Trigger a full database backup' })
  @ApiResponse({ status: 201, description: 'Full backup created' })
  async createFullBackup(@Body('description') description?: string) {
    return this.backupService.createFullBackup(description);
  }

  @Post('incremental')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Trigger an incremental backup' })
  @ApiResponse({ status: 201, description: 'Incremental backup created' })
  async createIncrementalBackup() {
    return this.backupService.createIncrementalBackup();
  }

  @Post('restore-token')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Generate a time-limited restore token' })
  @ApiResponse({ status: 201, description: 'Restore token generated' })
  async generateRestoreToken(@CurrentUser('id') userId: string) {
    const token = this.backupService.generateRestoreToken(userId);
    return { token, expiresIn: parseInt(this.configService.get('BACKUP_RESTORE_TOKEN_TTL', '300')) };
  }

  @Post('restore/:id')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Restore from a backup' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, description: 'Backup restored' })
  @ApiResponse({ status: 400, description: 'Invalid confirmation token' })
  async restoreBackup(
    @Param('id') id: string,
    @Body() dto: RestoreBackupDto,
  ) {
    await this.backupService.restoreBackup(id, { confirmationToken: dto.confirmationToken, restoreToken: dto.restoreToken });
    return { message: `Backup ${id} restored successfully` };
  }

  @Post('cleanup')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Clean up old backups based on retention policy' })
  @ApiResponse({ status: 200, description: 'Old backups cleaned' })
  async cleanupOldBackups(@Body() dto: CleanupBackupDto) {
    return this.backupService.cleanupOldBackups(dto.retentionDays);
  }

  @Get('integrity/:id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Verify backup file integrity' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, description: 'Integrity check result' })
  async verifyIntegrity(@Param('id') id: string) {
    return this.backupService.verifyBackupIntegrity(id);
  }

  @Get(':id/download')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Download a backup file' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, description: 'Backup file stream' })
  @ApiResponse({ status: 404, description: 'Backup or file not found' })
  async download(@Param('id') id: string, @Res() res: Response) {
    const { filepath, filename } = this.backupService.getBackupFile(id);
    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename.replace(/["\r\n]/g, '')}"`);
    const stream = createReadStream(filepath);
    stream.on('error', () => {
      if (!res.headersSent) res.status(404).json({ success: false, message: 'Backup file unavailable' });
      else res.end();
    });
    stream.pipe(res);
  }

  @Get('schedule')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Get all backup schedules' })
  @ApiResponse({ status: 200, description: 'Schedules listed' })
  async getBackupSchedules() {
    return this.backupService.getBackupSchedules();
  }

  @Post('schedule')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a backup schedule' })
  @ApiResponse({ status: 201, description: 'Schedule created' })
  async createBackupSchedule(@Body() dto: CreateScheduleDto) {
    return this.backupService.createBackupSchedule(dto);
  }

  @Delete('schedule/:id')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a backup schedule' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, description: 'Schedule deleted' })
  async deleteBackupSchedule(@Param('id') id: string) {
    await this.backupService.deleteBackupSchedule(id);
    return { message: `Schedule ${id} deleted` };
  }
}
