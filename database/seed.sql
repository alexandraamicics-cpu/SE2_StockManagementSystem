USE db_1800soles_stock_management;

DELETE FROM activity_log;
DELETE FROM pairs;
DELETE FROM items;
DELETE FROM password_resets;
-- Intentionally do not delete users.
-- This allows the project to run with zero default users.
-- while preserving any real users that already registered.

-- Helper: brand ids
SET @nike := (SELECT brand_id FROM brands WHERE brand_name='Nike');
SET @adidas := (SELECT brand_id FROM brands WHERE brand_name='Adidas');
SET @puma := (SELECT brand_id FROM brands WHERE brand_name='Puma');
SET @nb := (SELECT brand_id FROM brands WHERE brand_name='New Balance');
SET @others := (SELECT brand_id FROM brands WHERE brand_name='Others');

INSERT INTO items (item_name, sku, colorway, brand_id, target_qty, item_condition, status, last_movement_type, last_movement_at)
VALUES
('Nike Dunk Low', 'DD1391-100', 'Orange Paisley', @nike, 10, 'Brand New', 'IN_STOCK', 'STOCK_IN', '2020-02-11 10:00:00'),
('Jordan 4', 'DC7770-160', 'Fire Red', @nike, 5, 'Brand New', 'WAITING_STOCK', 'SOLD', '2024-12-15 10:30:00'),
('Nike Vomero 5', 'FB1309-001', 'Platinum Tint', @nike, 5, 'Brand New', 'WAITING_STOCK', 'STOCK_IN', '2020-03-02 09:00:00'),
('Nmd R1', 'FV8727', 'Og White', @adidas, 5, 'Brand New', 'WAITING_STOCK', 'STOCK_OUT', '2021-11-11 15:00:00');

SET @item1 := (SELECT item_id FROM items WHERE sku='DD1391-100');
SET @item2 := (SELECT item_id FROM items WHERE sku='DC7770-160');
SET @item3 := (SELECT item_id FROM items WHERE sku='FB1309-001');
SET @item4 := (SELECT item_id FROM items WHERE sku='FV8727');

INSERT INTO pairs (pair_code, item_id, us_size, gender, pair_condition, cost_price, selling_price, status, sold_at, sold_price)
VALUES
('P-001', @item1, '7', 'Male', 'New', 2000.00, 2500.00, 'AVAILABLE', NULL, NULL),
('P-002', @item1, '8', 'Male', 'New', 2200.00, 2700.00, 'AVAILABLE', NULL, NULL),
('P-005', @item1, '8', 'Male', 'New', 2200.00, 2700.00, 'AVAILABLE', NULL, NULL),
('P-006', @item1, '8', 'Male', 'New', 2200.00, 2700.00, 'AVAILABLE', NULL, NULL),
('P-010', @item2, '7', 'Male', 'New', 3000.00, 8000.00, 'SOLD', '2024-12-15 10:30:00', 8000.00),
('P-011', @item2, '8', 'Male', 'New', 3200.00, 8500.00, 'AVAILABLE', NULL, NULL),
('P-020', @item3, '7', 'Female', 'New', 2300.00, 2900.00, 'AVAILABLE', NULL, NULL),
('P-030', @item4, '9', 'Male', 'New', 2400.00, 3100.00, 'AVAILABLE', NULL, NULL);

-- Optional activity seed: inserts only if at least one user exists.
-- This avoids FK errors when running with zero default users.
SET @seed_user := (SELECT user_id FROM users ORDER BY created_at ASC LIMIT 1);

INSERT INTO activity_log (user_id, action_type, item_id, pair_id, quantity, sold_price, description, timestamp)
SELECT
  @seed_user,
  src.action_type,
  src.item_id,
  src.pair_id,
  src.quantity,
  src.sold_price,
  src.description,
  src.timestamp
FROM (
  SELECT 'STOCK_IN' AS action_type, @item1 AS item_id, (SELECT pair_id FROM pairs WHERE pair_code='P-001') AS pair_id, 1 AS quantity, NULL AS sold_price, 'Stocked in pair P-001' AS description, '2020-02-11 10:00:00' AS timestamp
  UNION ALL
  SELECT 'STOCK_IN', @item1, (SELECT pair_id FROM pairs WHERE pair_code='P-002'), 1, NULL, 'Stocked in pair P-002', '2020-02-11 10:05:00'
  UNION ALL
  SELECT 'STOCK_IN', @item1, (SELECT pair_id FROM pairs WHERE pair_code='P-005'), 1, NULL, 'Stocked in pair P-005', '2020-02-11 10:10:00'
  UNION ALL
  SELECT 'STOCK_IN', @item1, (SELECT pair_id FROM pairs WHERE pair_code='P-006'), 1, NULL, 'Stocked in pair P-006', '2020-02-11 10:15:00'
  UNION ALL
  SELECT 'SOLD', @item2, (SELECT pair_id FROM pairs WHERE pair_code='P-010'), 1, 8000.00, 'Pair sold', '2024-12-15 10:30:00'
  UNION ALL
  SELECT 'STOCK_IN', @item2, (SELECT pair_id FROM pairs WHERE pair_code='P-011'), 1, NULL, 'Stocked in pair P-011', '2026-02-01 10:00:00'
  UNION ALL
  SELECT 'STOCK_IN', @item3, (SELECT pair_id FROM pairs WHERE pair_code='P-020'), 1, NULL, 'Stocked in pair P-020', '2020-03-02 09:00:00'
  UNION ALL
  SELECT 'STOCK_IN', @item4, (SELECT pair_id FROM pairs WHERE pair_code='P-030'), 1, NULL, 'Stocked in pair P-030', '2021-11-11 15:00:00'
) AS src
WHERE @seed_user IS NOT NULL;
