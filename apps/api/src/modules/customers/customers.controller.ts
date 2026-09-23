import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query,
  HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';
import { CustomersService } from './customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { QueryCustomerDto } from './dto/query-customer.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('customers')
@ApiBearerAuth()
@Roles('ADMIN', 'STAFF')
@Controller('customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get('search')
  @ApiOperation({ summary: 'Search customers' })
  @ApiQuery({ name: 'q', type: String })
  @ApiResponse({ status: 200, description: 'Search results' })
  async search(@Query('q') query: string) {
    return this.customersService.search(query);
  }

  @Get()
  @ApiOperation({ summary: 'List customers with pagination and filters' })
  @ApiResponse({ status: 200, description: 'Customers listed' })
  async findAll(@Query() query: QueryCustomerDto) {
    return this.customersService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get customer by ID' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, description: 'Customer found' })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  async findById(@Param('id') id: string) {
    return this.customersService.findById(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create customer' })
  @ApiResponse({ status: 201, description: 'Customer created' })
  async create(@Body() dto: CreateCustomerDto, @CurrentUser('id') userId: string) {
    return this.customersService.create(dto, userId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update customer' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, description: 'Customer updated' })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateCustomerDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.customersService.update(id, dto, userId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete customer (soft delete)' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, description: 'Customer deleted' })
  async remove(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.customersService.remove(id, userId);
  }
}