import { Module } from '@nestjs/common';
import { InventoryController } from './inventory.controller';
import { ProductsController } from './products.controller';
import { InventoryService } from './inventory.service';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [InventoryController, ProductsController],
  providers: [InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}