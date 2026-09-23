import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { UpdateSettingDto } from './dto/update-setting.dto';

@Injectable()
export class SettingsService {
  constructor(private prisma: PrismaService) {}

  private stringifyValue(value: any): string {
    if (typeof value === 'string') return value;
    if (value === null || value === undefined) return '';
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  async findAll() {
    return this.prisma.companySetting.findMany({
      orderBy: { key: 'asc' },
    });
  }

  async findByCategory(_category: string) {
    return this.prisma.companySetting.findMany({
      orderBy: { key: 'asc' },
    });
  }

  async update(key: string, dto: UpdateSettingDto) {
    const setting = await this.prisma.companySetting.findUnique({
      where: { key },
    });

    if (!setting) {
      throw new NotFoundException(`Setting "${key}" not found. Use the seed or add it first.`);
    }

    return this.prisma.companySetting.update({
      where: { key },
      data: {
        value: this.stringifyValue(dto.value),
        ...(dto.description !== undefined && { description: dto.description }),
      },
    });
  }
}