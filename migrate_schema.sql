-- Inventory Table Schema Migration
-- Run this in your Supabase SQL Editor:
-- Dashboard > SQL Editor > New Query > Paste & Run

ALTER TABLE inventory
  ADD COLUMN IF NOT EXISTS marked_by           TEXT,
  ADD COLUMN IF NOT EXISTS generated_description TEXT,
  ADD COLUMN IF NOT EXISTS generated_image_urls  TEXT,
  ADD COLUMN IF NOT EXISTS spatial_boxes_3d      JSONB,
  ADD COLUMN IF NOT EXISTS invoice_id            TEXT,
  ADD COLUMN IF NOT EXISTS print_date            TEXT,
  ADD COLUMN IF NOT EXISTS sent_notes            TEXT,
  ADD COLUMN IF NOT EXISTS sent_pack             TEXT,
  ADD COLUMN IF NOT EXISTS sent_date             TEXT,
  ADD COLUMN IF NOT EXISTS book_landed           NUMERIC,
  ADD COLUMN IF NOT EXISTS book_retail           NUMERIC,
  ADD COLUMN IF NOT EXISTS book_barcode          TEXT,
  ADD COLUMN IF NOT EXISTS book_aq_code          TEXT,
  ADD COLUMN IF NOT EXISTS book_land_code        TEXT,
  ADD COLUMN IF NOT EXISTS vendor_id             TEXT,
  ADD COLUMN IF NOT EXISTS is_hidden             BOOLEAN DEFAULT FALSE;
