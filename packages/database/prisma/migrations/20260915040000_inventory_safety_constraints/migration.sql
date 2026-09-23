-- Manual defensive constraints (Prisma schema model does not support @@check in this version).
-- - currentStock can never go negative at the database level
-- - sale item quantity must be positive
ALTER TABLE "products"
  ADD CONSTRAINT "products_current_stock_non_negative"
  CHECK ("currentStock" >= 0);

ALTER TABLE "sale_items"
  ADD CONSTRAINT "sale_items_quantity_positive"
  CHECK ("quantity" > 0);