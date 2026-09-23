import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query,
  HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';
import { InventoryService } from './inventory.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { QueryProductDto } from './dto/query-product.dto';
import { CreateStockMovementDto } from './dto/create-stock-movement.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('products')
@ApiBearerAuth()
@Roles('ADMIN', 'STAFF')
@Controller('products')
export class ProductsController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get('lookup')
  @ApiOperation({ summary: 'Scanner lookup by barcode, SKU, name or ID' })
  @ApiQuery({ name: 'q', type: String })
  @ApiResponse({ status: 200, description: 'Matched product or null' })
  async lookup(@Query('q') q: string) {
    return this.inventoryService.lookup(q);
  }

  @Get('low-stock')
  @ApiOperation({ summary: 'Get low stock products' })
  @ApiResponse({ status: 200, description: 'Low stock products listed' })
  async getLowStock() {
    return this.inventoryService.getLowStock();
  }

  @Get()
  @ApiOperation({ summary: 'List products with pagination and filters' })
  @ApiResponse({ status: 200, description: 'Products listed' })
  async findAll(@Query() query: QueryProductDto) {
    return this.inventoryService.findAll(query);
  }

  @Get('movements')
  @ApiOperation({ summary: 'Get all stock movements' })
  @ApiResponse({ status: 200, description: 'Movements listed' })
  async getMovements(@Query() query: QueryProductDto) {
    return this.inventoryService.findMovements({
      page: query.page,
      limit: query.limit,
      search: query.search,
    });
  }

  @Get(':id/movements')
  @ApiOperation({ summary: 'Get stock movements for a product' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, description: 'Movements listed' })
  async getProductMovements(@Param('id') id: string) {
    return this.inventoryService.findProductMovements(id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get product by ID' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, description: 'Product found' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  async findById(@Param('id') id: string) {
    return this.inventoryService.findById(id);
  }

  @Post()
  @Roles('ADMIN', 'STAFF')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create product' })
  @ApiResponse({ status: 201, description: 'Product created' })
  async create(@Body() dto: CreateProductDto, @CurrentUser('id') userId: string) {
    return this.inventoryService.create(dto, userId);
  }

  @Patch(':id')
  @Roles('ADMIN', 'STAFF')
  @ApiOperation({ summary: 'Update product' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, description: 'Product updated' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.inventoryService.update(id, dto, userId);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete product (admin only, soft delete)' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, description: 'Product deleted' })
  async remove(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.inventoryService.remove(id, userId);
  }

  @Post(':id/movements')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create stock movement (purchase / return / adjustment / damaged / lost)' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 201, description: 'Movement created' })
  async createMovement(
    @Param('id') id: string,
    @Body() dto: CreateStockMovementDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.inventoryService.createMovement(id, dto, userId);
  }
}