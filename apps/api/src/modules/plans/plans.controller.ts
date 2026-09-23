import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query,
  HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { PlansService } from './plans.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { QueryPlanDto } from './dto/query-plan.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('plans')
@ApiBearerAuth()
@Controller('plans')
export class PlansController {
  constructor(private readonly plansService: PlansService) {}

  @Get('active')
  @Roles('ADMIN', 'STAFF')
  @ApiOperation({ summary: 'Get active plans' })
  @ApiResponse({ status: 200, description: 'Active plans retrieved' })
  async findActive() {
    return this.plansService.findActive();
  }

  @Get()
  @Roles('ADMIN', 'STAFF')
  @ApiOperation({ summary: 'List all plans' })
  @ApiResponse({ status: 200, description: 'Plans listed' })
  async findAll(@Query() query: QueryPlanDto) {
    return this.plansService.findAll(query);
  }

  @Get(':id')
  @Roles('ADMIN', 'STAFF')
  @ApiOperation({ summary: 'Get plan by ID' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, description: 'Plan found' })
  @ApiResponse({ status: 404, description: 'Plan not found' })
  async findById(@Param('id') id: string) {
    return this.plansService.findById(id);
  }

  @Post()
  @Roles('ADMIN')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create plan (admin only)' })
  @ApiResponse({ status: 201, description: 'Plan created' })
  async create(@Body() dto: CreatePlanDto, @CurrentUser('id') userId: string) {
    return this.plansService.create(dto, userId);
  }

  @Patch(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Update plan (admin only)' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, description: 'Plan updated' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdatePlanDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.plansService.update(id, dto, userId);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete plan (admin only)' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, description: 'Plan deleted' })
  async remove(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.plansService.remove(id, userId);
  }
}