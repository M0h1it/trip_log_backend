-- Run this ONLY if you already created the `entries` table before this
-- change (it will have a single `phone` VARCHAR column, not `phones` JSON).
-- If you are setting up fresh, just use schema.sql — you don't need this file.
--
-- Run in phpMyAdmin: select your database > SQL tab > paste > Go

ALTER TABLE entries
  ADD COLUMN phones JSON AFTER title;

-- Move existing single phone values into the new array column. Old data
-- (like the S.M. Jewels card) may have multiple numbers jammed into one
-- comma-separated string — this splits them apart into a proper array so
-- each one becomes its own entry going forward.
UPDATE entries
  SET phones = (
    SELECT JSON_ARRAYAGG(TRIM(num))
    FROM JSON_TABLE(
      CONCAT('["', REPLACE(TRIM(phone), ',', '","'), '"]'),
      '$[*]' COLUMNS (num VARCHAR(100) PATH '$')
    ) AS t
    WHERE TRIM(num) != ''
  )
  WHERE phone IS NOT NULL AND TRIM(phone) != '';

UPDATE entries
  SET phones = JSON_ARRAY()
  WHERE phones IS NULL;

ALTER TABLE entries
  DROP COLUMN phone;
