-- Run in Supabase SQL Editor if settings table already exists without currency columns
ALTER TABLE settings ADD COLUMN IF NOT EXISTS currency_rate_gbp NUMERIC NOT NULL DEFAULT 0.79;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS currency_rate_aud NUMERIC NOT NULL DEFAULT 1.53;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS currency_rate_nzd NUMERIC NOT NULL DEFAULT 1.64;
