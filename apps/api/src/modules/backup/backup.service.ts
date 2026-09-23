import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const execAsync = promisify(exec);

export interface BackupRecord {
  id: string;
  filename: string;
  size: number;
  storagePath: string;
  type: 'full' | 'incremental';
  status: 'completed' | 'failed';
  description?: string;
  checksum?: string;
  createdAt: string;
}

export interface BackupSchedule {
  id: string;
  type: string;
  cronExpression: string;
  enabled: boolean;
  lastRun?: string;
  nextRun?: string;
  createdAt: string;
}

@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);
  private readonly backupDir: string;
  private readonly encryptionKey: string;
  private readonly manifestFile: string;
  private readonly schedulesFile: string;
  private restoreTokens = new Map<string, { expiresAt: Date; used: boolean; userId?: string }>();

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {
    this.backupDir = this.configService.get('BACKUP_DIR', path.join(process.cwd(), 'backups'));
    this.encryptionKey = this.configService.get('ENCRYPTION_KEY', '');
    this.manifestFile = path.join(this.backupDir, 'backups.json');
    this.schedulesFile = path.join(this.backupDir, 'schedules.json');
    this.ensureBackupDir();
  }

  generateRestoreToken(userId: string): string {
    const now = new Date();
    for (const [key, val] of this.restoreTokens) {
      if (val.expiresAt < now) this.restoreTokens.delete(key);
    }
    const token = crypto.randomBytes(32).toString('hex');
    const ttl = parseInt(this.configService.get('BACKUP_RESTORE_TOKEN_TTL', '300'), 10) * 1000;
    this.restoreTokens.set(token, { expiresAt: new Date(now.getTime() + ttl), used: false, userId });
    return token;
  }

  validateRestoreToken(token: string): boolean {
    const entry = this.restoreTokens.get(token);
    if (!entry) return false;
    if (entry.used) { this.restoreTokens.delete(token); return false; }
    if (entry.expiresAt < new Date()) { this.restoreTokens.delete(token); return false; }
    entry.used = true;
    return true;
  }

  private ensureBackupDir() {
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
    }
  }

  private getManifest(): BackupRecord[] {
    if (!fs.existsSync(this.manifestFile)) return [];
    try {
      return JSON.parse(fs.readFileSync(this.manifestFile, 'utf8'));
    } catch {
      return [];
    }
  }

  private saveManifest(records: BackupRecord[]) {
    fs.writeFileSync(this.manifestFile, JSON.stringify(records, null, 2));
  }

  private getRecord(id: string): BackupRecord {
    const record = this.getManifest().find((r) => r.id === id);
    if (!record) throw new NotFoundException('Backup not found');
    return record;
  }

  private resolvePath(storagePath: string): string {
    return path.isAbsolute(storagePath)
      ? storagePath
      : path.join(process.cwd(), storagePath);
  }

  private getDatabaseConfig() {
    const databaseUrl = this.configService.get('DATABASE_URL');
    if (!databaseUrl) throw new Error('DATABASE_URL not configured');

    const url = new URL(databaseUrl);
    return {
      host: url.hostname || 'localhost',
      port: url.port || '5432',
      dbName: url.pathname.replace('/', ''),
      username: url.username,
      env: { ...process.env, PGPASSWORD: url.password },
    };
  }

  async createFullBackup(description?: string): Promise<Omit<BackupRecord, 'checksum'>> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `full-backup-${timestamp}.sql.gz`;
    const filepath = path.join(this.backupDir, filename);

    this.logger.log(`Starting full database backup: ${filename}`);

    const { host, port, dbName, username, env } = this.getDatabaseConfig();

    try {
      const pgDumpPath = this.configService.get('PG_DUMP_PATH', 'pg_dump');
      const command = `${pgDumpPath} -h ${host} -p ${port} -U ${username} -d ${dbName} --no-owner --no-privileges --clean --if-exists | gzip > "${filepath}"`;

      await execAsync(command, {
        env,
        timeout: 300000,
        maxBuffer: 50 * 1024 * 1024,
      });

      const stats = fs.statSync(filepath);
      const checksum = await this.generateChecksum(filepath);

      let finalPath = filepath;
      let finalFilename = filename;
      if (this.encryptionKey) {
        await this.encryptFile(filepath);
        finalPath = `${filepath}.enc`;
        finalFilename = `${filename}.enc`;
      }

      const size = fs.statSync(finalPath).size;
      const record: BackupRecord = {
        id: crypto.randomUUID(),
        filename: finalFilename,
        size,
        storagePath: path.relative(process.cwd(), finalPath),
        type: 'full',
        status: 'completed',
        description,
        checksum,
        createdAt: new Date().toISOString(),
      };

      const manifest = this.getManifest();
      manifest.push(record);
      this.saveManifest(manifest);

      this.logger.log(`Backup completed: ${finalFilename} (${size} bytes, sha256:${checksum})`);
      return this.withoutChecksum(record);
    } catch (error: any) {
      this.logger.error(`Backup failed: ${error.message}`);
      const record: BackupRecord = {
        id: crypto.randomUUID(),
        filename,
        size: 0,
        storagePath: path.relative(process.cwd(), filepath),
        type: 'full',
        status: 'failed',
        description,
        createdAt: new Date().toISOString(),
      };
      const manifest = this.getManifest();
      manifest.push(record);
      this.saveManifest(manifest);
      throw error;
    }
  }

  async createIncrementalBackup() {
    const manifest = this.getManifest();
    const lastBackup = manifest
      .filter((r) => r.status === 'completed' && r.type === 'full')
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .pop();

    if (!lastBackup) {
      this.logger.log('No previous full backup found, creating full backup instead');
      const full = await this.createFullBackup('No previous backup, full backup created');
      return { ...full, changes: { customers: 0, subscriptions: 0, sales: 0, products: 0 } };
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `incremental-${timestamp}.json`;
    const filepath = path.join(this.backupDir, filename);

    const since = new Date(lastBackup.createdAt);

    const [updatedCustomers, updatedSubscriptions, updatedSales, updatedProducts] = await Promise.all([
      this.prisma.customer.findMany({ where: { updatedAt: { gt: since } }, select: { id: true, updatedAt: true } }),
      this.prisma.subscription.findMany({ where: { updatedAt: { gt: since } }, select: { id: true, updatedAt: true } }),
      this.prisma.sale.findMany({ where: { updatedAt: { gt: since } }, select: { id: true, updatedAt: true } }),
      this.prisma.product.findMany({ where: { updatedAt: { gt: since } }, select: { id: true, updatedAt: true } }),
    ]);

    const changes = {
      since: since.toISOString(),
      updatedCustomers,
      updatedSubscriptions,
      updatedSales,
      updatedProducts,
    };
    fs.writeFileSync(filepath, JSON.stringify(changes, null, 2));

    const stats = fs.statSync(filepath);
    const record: BackupRecord = {
      id: crypto.randomUUID(),
      filename,
      size: stats.size,
      storagePath: path.relative(process.cwd(), filepath),
      type: 'incremental',
      status: 'completed',
      createdAt: new Date().toISOString(),
    };
    const manifest2 = this.getManifest();
    manifest2.push(record);
    this.saveManifest(manifest2);

    this.logger.log(`Incremental backup completed: ${filename}`);

    return {
      id: record.id,
      filename,
      size: stats.size,
      storagePath: record.storagePath,
      createdAt: record.createdAt,
      changes: {
        customers: updatedCustomers.length,
        subscriptions: updatedSubscriptions.length,
        sales: updatedSales.length,
        products: updatedProducts.length,
      },
    };
  }

  async restoreBackup(backupId: string, options: { confirmationToken: string; restoreToken: string }) {
    if (!this.validateRestoreToken(options.restoreToken)) {
      throw new BadRequestException('Invalid or expired restore token');
    }

    const backup = this.getRecord(backupId);
    if (backup.status !== 'completed') {
      throw new BadRequestException('Backup is not completed');
    }

    this.logger.warn(`Starting database restore from backup: ${backup.filename}`);

    let filepath = this.resolvePath(backup.storagePath);
    if (!fs.existsSync(filepath)) {
      throw new BadRequestException('Backup file not found on disk');
    }

    if (this.encryptionKey && filepath.endsWith('.enc')) {
      filepath = await this.decryptFile(filepath);
    }

    const { host, port, dbName, username, env } = this.getDatabaseConfig();

    try {
      if (backup.type === 'full') {
        const command = `gunzip -c "${filepath}" | psql -h ${host} -p ${port} -U ${username} -d ${dbName} --no-owner`;
        await execAsync(command, { env, timeout: 600000 });
      } else {
        this.logger.warn('Incremental restore: JSON data parsed but not applied (requires application-level logic)');
      }

      this.logger.log(`Restore completed from: ${backup.filename}`);
    } catch (error: any) {
      this.logger.error(`Restore failed: ${error.message}`);
      throw error;
    }
  }

  async findAll(query: { page?: number; limit?: number; type?: string }) {
    const { page = 1, limit = 20, type } = query;
    let records = this.getManifest().sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    if (type) records = records.filter((r) => r.type === type);

    const total = records.length;
    const data = records.slice((page - 1) * limit, (page - 1) * limit + limit).map((r) => {
      const { checksum, ...rest } = r;
      void checksum;
      return rest;
    });

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    };
  }

  private withoutChecksum(record: BackupRecord): Omit<BackupRecord, 'checksum'> {
    const { checksum: _checksum, ...rest } = record;
    void _checksum;
    return rest;
  }

  async cleanupOldBackups(retentionDays: number = 30) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);

    let cleaned = 0;
    const errors: string[] = [];
    let manifest = this.getManifest();

    for (const backup of manifest) {
      if (new Date(backup.createdAt) >= cutoff || backup.status !== 'completed') continue;
      try {
        const filepath = this.resolvePath(backup.storagePath);
        if (fs.existsSync(filepath)) {
          fs.unlinkSync(filepath);
        }
        manifest = manifest.filter((r) => r.id !== backup.id);
        cleaned++;
      } catch (e) {
        const msg = `Failed to clean backup ${backup.id}: ${(e as Error).message}`;
        this.logger.warn(msg);
        errors.push(msg);
      }
    }

    if (cleaned > 0 || manifest.length !== (await this.getBackupCount())) {
      this.saveManifest(manifest);
    }

    this.logger.log(`Cleaned up ${cleaned} old backups (retention: ${retentionDays} days)`);
    return { cleaned, errors };
  }

  private async getBackupCount(): Promise<number> {
    return this.getManifest().length;
  }

  async getBackupSchedules(): Promise<BackupSchedule[]> {
    if (!fs.existsSync(this.schedulesFile)) return [];
    return JSON.parse(fs.readFileSync(this.schedulesFile, 'utf8'));
  }

  async createBackupSchedule(data: { type: string; cronExpression: string; enabled?: boolean }): Promise<BackupSchedule> {
    const schedules = await this.getBackupSchedules();

    const schedule: BackupSchedule = {
      id: crypto.randomUUID(),
      type: data.type,
      cronExpression: data.cronExpression,
      enabled: data.enabled ?? true,
      createdAt: new Date().toISOString(),
    };

    schedules.push(schedule);
    fs.writeFileSync(this.schedulesFile, JSON.stringify(schedules, null, 2));

    this.logger.log(`Backup schedule created: ${schedule.id} (${schedule.cronExpression})`);
    return schedule;
  }

  async deleteBackupSchedule(scheduleId: string): Promise<void> {
    const schedules = await this.getBackupSchedules();
    const index = schedules.findIndex((s) => s.id === scheduleId);
    if (index === -1) {
      throw new NotFoundException('Backup schedule not found');
    }
    schedules.splice(index, 1);
    fs.writeFileSync(this.schedulesFile, JSON.stringify(schedules, null, 2));
    this.logger.log(`Backup schedule deleted: ${scheduleId}`);
  }

  async verifyBackupIntegrity(backupId: string) {
    const backup = this.getRecord(backupId);
    const filepath = this.resolvePath(backup.storagePath);

    if (!fs.existsSync(filepath)) {
      return { valid: false, storedSize: backup.size || 0, actualSize: 0 };
    }

    const stats = fs.statSync(filepath);
    let checksumValid: boolean | null = null;
    if (backup.checksum) {
      const checksum = await this.generateChecksum(filepath);
      checksumValid = checksum === backup.checksum;
    }

    return {
      valid: stats.size === backup.size && (checksumValid === null || checksumValid),
      storedSize: backup.size || 0,
      actualSize: stats.size,
      checksumValid,
    };
  }

  private async generateChecksum(filepath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filepath);
      stream.on('data', (data) => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  private async encryptFile(filepath: string): Promise<void> {
    const key = crypto.scryptSync(this.encryptionKey, 'backup-salt', 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);

    const input = fs.readFileSync(filepath);
    const encrypted = Buffer.concat([iv, cipher.update(input), cipher.final()]);

    fs.writeFileSync(`${filepath}.enc`, encrypted);
    fs.unlinkSync(filepath);
  }

  private async decryptFile(filepath: string): Promise<string> {
    const key = crypto.scryptSync(this.encryptionKey, 'backup-salt', 32);
    const data = fs.readFileSync(filepath);
    const iv = data.subarray(0, 16);
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    const decrypted = Buffer.concat([decipher.update(data.subarray(16)), decipher.final()]);

    const decryptedPath = filepath.replace('.enc', '');
    fs.writeFileSync(decryptedPath, decrypted);
    return decryptedPath;
  }
}