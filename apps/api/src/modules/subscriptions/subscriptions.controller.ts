import {
  Controller, Get, Post, Patch, Body, Param, Query,
  HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { SubscriptionsService } from './subscriptions.service';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';
import { QuerySubscriptionDto } from './dto/query-subscription.dto';
import { RenewSubscriptionDto } from './dto/renew-subscription.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('subscriptions')
@ApiBearerAuth()
@Roles('ADMIN', 'STAFF')
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Get()
  @ApiOperation({ summary: 'List subscriptions' })
  @ApiResponse({ status: 200, description: 'Subscriptions listed' })
  async findAll(@Query() query: QuerySubscriptionDto) {
    return this.subscriptionsService.findAll(query);
  }

  @Get('stats/refresh')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Recompute subscription statuses from dates' })
  @ApiResponse({ status: 200, description: 'Statuses refreshed' })
  async refreshStatuses(@CurrentUser('id') userId: string) {
    return this.subscriptionsService.refreshAllStatuses(userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get subscription by ID' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, description: 'Subscription found' })
  async findById(@Param('id') id: string) {
    return this.subscriptionsService.findById(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create subscription' })
  @ApiResponse({ status: 201, description: 'Subscription created' })
  async create(@Body() dto: CreateSubscriptionDto, @CurrentUser('id') userId: string) {
    return this.subscriptionsService.create(dto, userId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update subscription' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, description: 'Subscription updated' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateSubscriptionDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.subscriptionsService.update(id, dto, userId);
  }

  @Post(':id/renew')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Renew subscription (resets reminders)' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, description: 'Subscription renewed' })
  async renew(
    @Param('id') id: string,
    @Body() dto: RenewSubscriptionDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.subscriptionsService.renew(id, dto, userId);
  }

  @Post(':id/suspend')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Suspend subscription' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, description: 'Subscription suspended' })
  async suspend(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.subscriptionsService.suspend(id, userId);
  }

  @Post(':id/activate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Activate subscription' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, description: 'Subscription activated' })
  async activate(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.subscriptionsService.activate(id, userId);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel subscription (soft delete)' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, description: 'Subscription cancelled' })
  async cancel(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.subscriptionsService.cancel(id, userId);
  }
}