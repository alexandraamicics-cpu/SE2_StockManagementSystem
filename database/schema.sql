CREATE DATABASE IF NOT EXISTS db_1800soles_stock_management;
USE db_1800soles_stock_management;

CREATE TABLE IF NOT EXISTS users (
  user_id CHAR(8) PRIMARY KEY,
  role VARCHAR(80) NOT NULL DEFAULT 'Staff',
  last_name VARCHAR(100) NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  middle_name VARCHAR(100) NOT NULL,
  suffix ENUM('Jr.','II','III') NULL,
  gender ENUM('Male','Female') NOT NULL DEFAULT 'Male',
  phone_number VARCHAR(9) NOT NULL DEFAULT '000000000',
  username VARCHAR(50) NOT NULL UNIQUE,
  email VARCHAR(100) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL ON UPDATE CURRENT_TIMESTAMP,
  is_active TINYINT NOT NULL DEFAULT 1
);

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS role VARCHAR(80) NOT NULL DEFAULT 'Staff' AFTER user_id,
  ADD COLUMN IF NOT EXISTS last_name VARCHAR(100) NOT NULL DEFAULT '' AFTER role,
  ADD COLUMN IF NOT EXISTS first_name VARCHAR(100) NOT NULL DEFAULT '' AFTER last_name,
  ADD COLUMN IF NOT EXISTS middle_name VARCHAR(100) NOT NULL DEFAULT '' AFTER first_name,
  ADD COLUMN IF NOT EXISTS suffix ENUM('Jr.','II','III') NULL AFTER middle_name,
  ADD COLUMN IF NOT EXISTS gender ENUM('Male','Female') NOT NULL DEFAULT 'Male' AFTER suffix,
  ADD COLUMN IF NOT EXISTS phone_number VARCHAR(9) NOT NULL DEFAULT '000000000' AFTER gender;

UPDATE users
SET role = 'Staff'
WHERE role IS NULL OR TRIM(role) = '';

UPDATE users
SET gender = 'Male'
WHERE gender IS NULL OR gender = '';

UPDATE users
SET phone_number = '000000000'
WHERE phone_number IS NULL OR phone_number = '';

UPDATE users
SET phone_number = SUBSTRING(phone_number, 2)
WHERE phone_number REGEXP '^9[0-9]{9}$';

UPDATE users
SET phone_number = SUBSTRING(phone_number, 3)
WHERE phone_number REGEXP '^09[0-9]{9}$';

UPDATE users
SET phone_number = SUBSTRING(phone_number, 4)
WHERE phone_number REGEXP '^639[0-9]{9}$';

UPDATE users
SET phone_number = RIGHT(phone_number, 9)
WHERE phone_number NOT REGEXP '^[0-9]{9}$';

ALTER TABLE users
  MODIFY COLUMN phone_number VARCHAR(9) NOT NULL DEFAULT '000000000';

SET @has_legacy_name := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = 'db_1800soles_stock_management'
    AND TABLE_NAME = 'users'
    AND COLUMN_NAME = 'name'
);

SET @fill_names_sql := IF(
  @has_legacy_name > 0,
  "UPDATE users
     SET
       last_name = IF(last_name = '', TRIM(SUBSTRING_INDEX(name, ',', 1)), last_name),
       first_name = IF(first_name = '', TRIM(SUBSTRING_INDEX(name, ',', -1)), first_name),
       middle_name = IF(middle_name = '', '', middle_name)
   WHERE name IS NOT NULL AND name <> ''",
  "SELECT 1"
);
PREPARE stmt_fill_names FROM @fill_names_sql;
EXECUTE stmt_fill_names;
DEALLOCATE PREPARE stmt_fill_names;

SET @split_middle_sql := IF(
  @has_legacy_name > 0,
  "UPDATE users
     SET
       middle_name = TRIM(SUBSTRING_INDEX(first_name, ' ', -1)),
       first_name = TRIM(SUBSTRING(first_name, 1, LENGTH(first_name) - LENGTH(TRIM(SUBSTRING_INDEX(first_name, ' ', -1))) - 1))
   WHERE middle_name = ''
     AND first_name LIKE '% %'
     AND TRIM(SUBSTRING_INDEX(first_name, ' ', -1)) REGEXP '^[A-Za-z]{1,3}[.]?$'",
  "SELECT 1"
);
PREPARE stmt_split_middle FROM @split_middle_sql;
EXECUTE stmt_split_middle;
DEALLOCATE PREPARE stmt_split_middle;

SET @drop_legacy_name_sql := IF(
  @has_legacy_name > 0,
  "ALTER TABLE users DROP COLUMN name",
  "SELECT 1"
);
PREPARE stmt_drop_legacy_name FROM @drop_legacy_name_sql;
EXECUTE stmt_drop_legacy_name;
DEALLOCATE PREPARE stmt_drop_legacy_name;

CREATE TABLE IF NOT EXISTS brands (
  brand_id INT AUTO_INCREMENT PRIMARY KEY,
  brand_name VARCHAR(50) NOT NULL UNIQUE
);

INSERT IGNORE INTO brands (brand_name) VALUES
('Nike'), ('Adidas'), ('Puma'), ('New Balance'), ('Others');

CREATE TABLE IF NOT EXISTS items (
  item_id INT AUTO_INCREMENT PRIMARY KEY,
  item_name VARCHAR(120) NOT NULL,
  sku VARCHAR(60) NOT NULL UNIQUE,
  colorway VARCHAR(80) NOT NULL,
  brand_id INT NOT NULL,
  target_qty INT NOT NULL DEFAULT 1,
  item_condition VARCHAR(30) NOT NULL DEFAULT 'Brand New',
  status ENUM('IN_STOCK','WAITING_STOCK') NOT NULL DEFAULT 'WAITING_STOCK',
  last_movement_type ENUM('STOCK_IN','SOLD','STOCK_OUT','EDITED','CREATED') NULL,
  last_movement_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL ON UPDATE CURRENT_TIMESTAMP,
  is_deleted TINYINT NOT NULL DEFAULT 0,
  CONSTRAINT fk_items_brand FOREIGN KEY (brand_id) REFERENCES brands(brand_id)
);

ALTER TABLE items
  ADD COLUMN IF NOT EXISTS target_qty INT NOT NULL DEFAULT 1 AFTER brand_id;

CREATE TABLE IF NOT EXISTS pairs (
  pair_id INT AUTO_INCREMENT PRIMARY KEY,
  pair_code VARCHAR(20) NOT NULL UNIQUE,
  item_id INT NOT NULL,
  us_size VARCHAR(10) NOT NULL,
  gender ENUM('Male','Female') NOT NULL DEFAULT 'Male',
  pair_condition VARCHAR(30) NOT NULL DEFAULT 'New',
  cost_price DECIMAL(10,2) NOT NULL,
  selling_price DECIMAL(10,2) NOT NULL,
  status ENUM('AVAILABLE','SOLD') NOT NULL DEFAULT 'AVAILABLE',
  sold_at DATETIME NULL,
  sold_price DECIMAL(10,2) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL ON UPDATE CURRENT_TIMESTAMP,
  is_deleted TINYINT NOT NULL DEFAULT 0,
  CONSTRAINT fk_pairs_item FOREIGN KEY (item_id) REFERENCES items(item_id)
);


ALTER TABLE pairs
  ADD COLUMN IF NOT EXISTS gender ENUM('Male','Female') NOT NULL DEFAULT 'Male' AFTER us_size;

UPDATE pairs
SET gender = CASE
  WHEN UPPER(RIGHT(TRIM(us_size), 1)) = 'F' THEN 'Female'
  ELSE 'Male'
END
WHERE us_size IS NOT NULL AND TRIM(us_size) <> '';

UPDATE pairs
SET us_size = TRIM(LEFT(TRIM(us_size), CHAR_LENGTH(TRIM(us_size)) - 1))
WHERE UPPER(RIGHT(TRIM(us_size), 1)) IN ('M', 'F')
  AND TRIM(us_size) REGEXP '^[0-9]+(\\.[0-9]+)?[MF]$';

UPDATE items i
LEFT JOIN (
  SELECT item_id, COUNT(*) AS total_pairs
  FROM pairs
  WHERE is_deleted = 0
  GROUP BY item_id
) p ON p.item_id = i.item_id
SET i.target_qty = CASE
  WHEN i.target_qty IS NULL OR i.target_qty < 1 THEN GREATEST(COALESCE(p.total_pairs, 1), 1)
  ELSE i.target_qty
END;

CREATE TABLE IF NOT EXISTS activity_log (
  log_id INT AUTO_INCREMENT PRIMARY KEY,
  timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  user_id CHAR(8) NOT NULL,
  action_type VARCHAR(50) NOT NULL,
  item_id INT NULL,
  pair_id INT NULL,
  quantity INT NULL,
  sold_price DECIMAL(10,2) NULL,
  description VARCHAR(255) NULL,
  CONSTRAINT fk_log_user FOREIGN KEY (user_id) REFERENCES users(user_id),
  CONSTRAINT fk_log_item FOREIGN KEY (item_id) REFERENCES items(item_id),
  CONSTRAINT fk_log_pair FOREIGN KEY (pair_id) REFERENCES pairs(pair_id)
);

CREATE TABLE IF NOT EXISTS sessions (
  session_id VARCHAR(128) PRIMARY KEY,
  expires BIGINT NOT NULL,
  data MEDIUMTEXT
);

CREATE TABLE IF NOT EXISTS password_resets (
  reset_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id CHAR(8) NOT NULL,
  token_hash VARCHAR(255) NOT NULL,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  CONSTRAINT fk_reset_user FOREIGN KEY (user_id) REFERENCES users(user_id)
);
