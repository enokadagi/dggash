import {
  Controller, Get, Post, Body, Param, Query, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiBody } from '@nestjs/swagger';
import { SalesService } from './sales.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { QuerySaleDto } from './dto/query-sale.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('sales')
@ApiBearerAuth()
@Roles('ADMIN', 'STAFF')
@Controller('sales')
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Get()
  @ApiOperation({ summary: 'List sales with pagination and filters' })
  @ApiResponse({ status: 200, description: 'Sales listed' })
  async findAll(@Query() query: QuerySaleDto) {
    return this.salesService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get sale by ID' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, description: 'Sale found' })
  @ApiResponse({ status: 404, description: 'Sale not found' })
  async findById(@Param('id') id: string) {
    return this.salesService.findById(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a sale (POS checkout). Decrements stock atomically.' })
  @ApiBody({ type: CreateSaleDto })
  @ApiResponse({ status: 201, description: 'Sale completed' })
  @ApiResponse({ status: 400, description: 'Invalid items or insufficient stock' })
  async create(@Body() dto: CreateSaleDto, @CurrentUser('id') userId: string) {
    return this.salesService.create(dto, userId);
  }

  @Post(':id/refund')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refund a sale (restores stock)' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, description: 'Sale refunded' })
  @ApiResponse({ status: 400, description: 'Sale is not refundable' })
  async refund(
    @Param('id') id: string,
    @Body('reason') reason: string | undefined,
    @CurrentUser('id') userId: string,
  ) {
    return this.salesService.refund(id, userId, reason);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel a sale (restores stock)' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, description: 'Sale cancelled' })
  @ApiResponse({ status: 400, description: 'Sale is not cancellable' })
  async cancel(
    @Param('id') id: string,
    @Body('reason') reason: string | undefined,
    @CurrentUser('id') userId: string,
  ) {
    return this.salesService.cancel(id, userId, reason);
  }
}