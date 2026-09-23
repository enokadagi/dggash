import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query,
  HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { InventoryService } from './inventory.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { QueryStockMovementDto } from './dto/query-stock-movement.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('inventory')
@ApiBearerAuth()
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get('categories')
  @Roles('ADMIN', 'STAFF')
  @ApiOperation({ summary: 'List inventory categories' })
  @ApiResponse({ status: 200, description: 'Categories listed' })
  async getCategories() {
    return this.inventoryService.findCategories();
  }

  @Post('categories')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create inventory category (admin only)' })
  @ApiResponse({ status: 201, description: 'Category created' })
  async createCategory(@Body() dto: CreateCategoryDto, @CurrentUser('id') userId: string) {
    return this.inventoryService.createCategory(dto, userId);
  }

  @Patch('categories/:id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Update inventory category (admin only)' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, description: 'Category updated' })
  async updateCategory(
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.inventoryService.updateCategory(id, dto, userId);
  }

  @Delete('categories/:id')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete inventory category (admin only, must be empty)' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, description: 'Category deleted' })
  async removeCategory(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.inventoryService.removeCategory(id, userId);
  }

  @Get('summary')
  @Roles('ADMIN', 'STAFF')
  @ApiOperation({ summary: 'Inventory summary metrics' })
  @ApiResponse({ status: 200, description: 'Summary returned' })
  async getSummary() {
    return this.inventoryService.getSummary();
  }

  @Get('movements')
  @Roles('ADMIN', 'STAFF')
  @ApiOperation({ summary: 'Get stock movements' })
  @ApiResponse({ status: 200, description: 'Movements listed' })
  async getMovements(@Query() query: QueryStockMovementDto) {
    return this.inventoryService.findMovements(query);
  }
}