-- Append-only ledgers (INV-5) and no hard-deleting products (PROD-3).
-- The application never issues these statements, so the triggers only matter if there is a bug or a mistake.
CREATE TRIGGER inventory_transaction_no_update BEFORE UPDATE ON inventory_transaction
BEGIN
  SELECT RAISE(ABORT, 'inventory_transaction is append-only');
END;
CREATE TRIGGER inventory_transaction_no_delete BEFORE DELETE ON inventory_transaction
BEGIN
  SELECT RAISE(ABORT, 'inventory_transaction is append-only');
END;
CREATE TRIGGER audit_log_no_update BEFORE UPDATE ON audit_log
BEGIN
  SELECT RAISE(ABORT, 'audit_log is append-only');
END;
CREATE TRIGGER audit_log_no_delete BEFORE DELETE ON audit_log
BEGIN
  SELECT RAISE(ABORT, 'audit_log is append-only');
END;
CREATE TRIGGER product_no_delete BEFORE DELETE ON product
BEGIN
  SELECT RAISE(ABORT, 'products are archived, never deleted');
END;