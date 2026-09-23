import { Controller, Get, Patch, Param, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { SettingsService } from './settings.service';
import { UpdateSettingDto } from './dto/update-setting.dto';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('settings')
@ApiBearerAuth()
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Get all settings' })
  @ApiResponse({ status: 200, description: 'Settings retrieved' })
  async findAll() {
    return this.settingsService.findAll();
  }

  @Patch(':key')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Update setting' })
  @ApiParam({ name: 'key', type: String })
  @ApiResponse({ status: 200, description: 'Setting updated' })
  async update(@Param('key') key: string, @Body() dto: UpdateSettingDto) {
    return this.settingsService.update(key, dto);
  }
}
