-- Run this ONLY if you already created the `entries` table before this
-- change (it will have a `title` VARCHAR column that's no longer used).
-- If you are setting up fresh, just use schema.sql — you don't need this file.
--
-- Run in phpMyAdmin: select your database > SQL tab > paste > Go

ALTER TABLE entries
  DROP COLUMN title;
