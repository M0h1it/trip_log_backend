-- Run this against your Hostinger MySQL database.
-- e.g. via phpMyAdmin's SQL tab, or: mysql -u USER -p DBNAME < schema.sql

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS entries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  local_id VARCHAR(64) NOT NULL UNIQUE, -- client-generated UUID, used to dedupe on sync
  user_id INT NOT NULL,

  contact_name VARCHAR(255),
  company_name VARCHAR(255),
  phones JSON,                       -- array of phone numbers, e.g. ["8369695753", "9082583941"]
  email VARCHAR(255),
  wechat VARCHAR(100),
  address TEXT,

  card_photo_paths JSON,              -- array of paths, e.g. ["cards/abc123.jpg", "cards/back456.jpg"]

  -- Each product photo now carries its OWN price tiers and remark, since a
  -- single entry can have several different products with different
  -- pricing. Shape: [{ photoPath, priceTiers: [{quantity,price,unit}], remarks }, ...]
  products JSON,

  remarks TEXT,  -- general notes about the MEETING, not tied to any one product

  entry_date DATE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_date (user_id, entry_date DESC),
  INDEX idx_local_id (local_id)
);