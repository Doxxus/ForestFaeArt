-- Sample data can be removed in one click (SAMP-3), so the database lets rows that belong to a sample product be
-- deleted. Everything else stays locked exactly as migration 0002 left it: a real product, and the ledger rows of a
-- real product, still can't be deleted, and the ledger can still never be edited.
DROP TRIGGER product_no_delete;
CREATE TRIGGER product_no_delete BEFORE DELETE ON product
WHEN OLD.is_sample = 0
BEGIN
  SELECT RAISE(ABORT, 'products are archived, never deleted');
END;
DROP TRIGGER inventory_transaction_no_delete;
CREATE TRIGGER inventory_transaction_no_delete BEFORE DELETE ON inventory_transaction
WHEN NOT EXISTS (SELECT 1 FROM product WHERE product.id = OLD.product_id AND product.is_sample = 1)
BEGIN
  SELECT RAISE(ABORT, 'inventory_transaction is append-only');
END;