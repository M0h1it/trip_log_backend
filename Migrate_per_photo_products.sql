-- Run this ONLY if you already created the `entries` table before this
-- change (it will have separate product_photo_paths, price_tiers, and a
-- single shared remarks column, instead of one combined `products` array).
-- If you are setting up fresh, just use schema.sql — you don't need this file.
--
-- Run in phpMyAdmin: select your database > SQL tab > paste > Go

ALTER TABLE entries
  ADD COLUMN products JSON AFTER card_photo_paths;

-- Migrate existing data: the old shared price_tiers + remarks get attached
-- to the FIRST product photo only (there's no way to know which photo a
-- price/remark was originally "for" when they were all shared, so this is
-- a best-guess migration, not a perfect reconstruction). Any additional
-- product photos beyond the first get an empty price/remarks of their own,
-- ready to be filled in individually going forward.
--
-- Built with explicit, ordered steps (rather than one combined aggregate
-- query) specifically so the FIRST photo really does end up first and
-- really does carry the old price/remarks — an earlier version of this
-- migration using JSON_ARRAYAGG directly did not reliably preserve order.

-- Step 1: entries with exactly one product photo — trivial case, that one
-- photo gets all the old price/remarks.
UPDATE entries
SET products = JSON_ARRAY(
  JSON_OBJECT(
    'photoPath', JSON_UNQUOTE(JSON_EXTRACT(product_photo_paths, '$[0]')),
    'priceTiers', COALESCE(price_tiers, JSON_ARRAY()),
    'remarks', COALESCE(remarks, '')
  )
)
WHERE JSON_LENGTH(COALESCE(product_photo_paths, JSON_ARRAY())) = 1;

-- Step 2: entries with 2+ product photos — first photo gets the old
-- price/remarks, every other photo gets an empty product record. Built
-- with a numbered temp table so ordering is explicit and verifiable rather
-- than relying on aggregate function ordering.
DROP TEMPORARY TABLE IF EXISTS tmp_product_rows;
CREATE TEMPORARY TABLE tmp_product_rows AS
SELECT
  e.id AS entry_id,
  jt.idx AS idx,
  jt.path AS photo_path
FROM entries e,
JSON_TABLE(
  e.product_photo_paths,
  '$[*]' COLUMNS (
    idx FOR ORDINALITY,
    path VARCHAR(500) PATH '$'
  )
) AS jt
WHERE JSON_LENGTH(COALESCE(e.product_photo_paths, JSON_ARRAY())) > 1;

DROP TEMPORARY TABLE IF EXISTS tmp_product_json;
CREATE TEMPORARY TABLE tmp_product_json AS
SELECT
  entry_id,
  JSON_ARRAYAGG(
    JSON_OBJECT(
      'photoPath', photo_path,
      'priceTiers', CASE WHEN idx = 1 THEN
        (SELECT COALESCE(price_tiers, JSON_ARRAY()) FROM entries WHERE id = entry_id)
        ELSE JSON_ARRAY() END,
      'remarks', CASE WHEN idx = 1 THEN
        (SELECT COALESCE(remarks, '') FROM entries WHERE id = entry_id)
        ELSE '' END
    )
  ) AS products_json
FROM (
  -- Force deterministic ordering into the aggregation by pre-sorting
  -- before GROUP BY, since JSON_ARRAYAGG has no native ORDER BY clause
  -- in the MySQL/MariaDB versions this needs to run on.
  SELECT entry_id, idx, photo_path
  FROM tmp_product_rows
  ORDER BY entry_id, idx
) AS ordered_rows
GROUP BY entry_id;

UPDATE entries e
JOIN tmp_product_json t ON t.entry_id = e.id
SET e.products = t.products_json;

DROP TEMPORARY TABLE IF EXISTS tmp_product_rows;
DROP TEMPORARY TABLE IF EXISTS tmp_product_json;

-- Entries with no product photos at all: still give them a valid empty
-- array rather than NULL, so the app never has to special-case this.
UPDATE entries
SET products = JSON_ARRAY()
WHERE products IS NULL;

-- The old top-level remarks now becomes purely "general meeting notes"
-- rather than being tied to a product — it stays as its own column,
-- untouched, since that's still a valid separate field. Only the
-- PRODUCT-specific columns are dropped here.
ALTER TABLE entries
  DROP COLUMN product_photo_paths,
  DROP COLUMN price_tiers;