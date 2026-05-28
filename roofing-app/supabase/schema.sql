-- =============================================================================
-- InstaRoof Quote — complete Supabase schema
-- Copy this entire file into: Supabase Dashboard → SQL Editor → New query → Run
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Enum: lead pipeline status
-- -----------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE lead_status AS ENUM ('quoted', 'booked', 'inspected', 'won', 'lost');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- -----------------------------------------------------------------------------
-- Table: leads
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS leads (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  address TEXT NOT NULL,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  zip_code TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  satellite_image_url TEXT,
  roof_sqft INTEGER,
  roof_type TEXT,
  roof_complexity TEXT,
  vision_confidence INTEGER,
  polygon_coordinates JSONB NOT NULL DEFAULT '[]'::JSONB,
  quote_repair_low NUMERIC,
  quote_repair_high NUMERIC,
  quote_standard_low NUMERIC,
  quote_standard_high NUMERIC,
  quote_premium_low NUMERIC,
  quote_premium_high NUMERIC,
  vision_analysis_raw TEXT,
  status lead_status NOT NULL DEFAULT 'quoted',
  name TEXT,
  email TEXT,
  phone TEXT,
  best_time_to_contact TEXT,
  inspection_datetime TIMESTAMPTZ,
  stripe_payment_id TEXT,
  deposit_paid BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS leads_created_at_idx ON leads (created_at DESC);

-- -----------------------------------------------------------------------------
-- Table: settings (single-row config; app auto-inserts defaults if empty)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS settings (
  id BIGSERIAL PRIMARY KEY,
  company_name TEXT NOT NULL DEFAULT 'Acme Roofing',
  company_phone TEXT NOT NULL DEFAULT '(555) 123-4567',
  company_email TEXT NOT NULL DEFAULT 'quotes@acmeroofing.com',
  company_logo_url TEXT,
  company_address TEXT,
  primary_color TEXT NOT NULL DEFAULT '#C8102E',
  secondary_color TEXT NOT NULL DEFAULT '#1F2937',
  price_per_sqft_repair_low NUMERIC NOT NULL DEFAULT 4,
  price_per_sqft_repair_high NUMERIC NOT NULL DEFAULT 7,
  price_per_sqft_standard_low NUMERIC NOT NULL DEFAULT 8,
  price_per_sqft_standard_high NUMERIC NOT NULL DEFAULT 12,
  price_per_sqft_premium_low NUMERIC NOT NULL DEFAULT 13,
  price_per_sqft_premium_high NUMERIC NOT NULL DEFAULT 18,
  material_multiplier_metal NUMERIC NOT NULL DEFAULT 1.4,
  material_multiplier_tile NUMERIC NOT NULL DEFAULT 1.6,
  deposit_amount NUMERIC NOT NULL DEFAULT 50,
  service_area_zip_codes TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  stripe_publishable_key TEXT,
  stripe_secret_key TEXT,
  twilio_account_sid TEXT,
  twilio_auth_token TEXT,
  twilio_from_number TEXT,
  google_maps_api_key TEXT,
  facebook_pixel_id TEXT,
  google_ads_tag TEXT,
  email_template_quote_ready TEXT NOT NULL DEFAULT '',
  email_template_booking_confirmed TEXT NOT NULL DEFAULT '',
  email_template_inspection_reminder TEXT NOT NULL DEFAULT '',
  owner_name TEXT NOT NULL DEFAULT 'Acme Roofing Team'
);

-- -----------------------------------------------------------------------------
-- Table: availability (day_of_week: 0 = Sunday … 6 = Saturday)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS availability (
  id BIGSERIAL PRIMARY KEY,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  time_slots TEXT[] NOT NULL DEFAULT ARRAY['09:00', '11:00', '13:00', '15:00'],
  blackout_dates DATE[] NOT NULL DEFAULT ARRAY[]::DATE[],
  UNIQUE (day_of_week)
);

-- -----------------------------------------------------------------------------
-- Table: testimonials
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS testimonials (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  location TEXT NOT NULL,
  quote_text TEXT NOT NULL,
  rating INTEGER NOT NULL DEFAULT 5 CHECK (rating BETWEEN 1 AND 5),
  photo_url TEXT
);

-- -----------------------------------------------------------------------------
-- Optional starter data (safe to run once on a new project)
-- -----------------------------------------------------------------------------

INSERT INTO availability (day_of_week, time_slots, blackout_dates)
SELECT d, ARRAY['09:00', '11:00', '13:00', '15:00']::TEXT[], ARRAY[]::DATE[]
FROM generate_series(0, 6) AS d
WHERE NOT EXISTS (SELECT 1 FROM availability LIMIT 1);

INSERT INTO testimonials (name, location, quote_text, rating)
SELECT name, location, quote_text, rating
FROM (
  VALUES
    ('Sarah M.', 'Austin, TX', 'Got my quote in minutes and the inspection was on time. Highly recommend!', 5),
    ('James K.', 'Denver, CO', 'Transparent pricing and no pressure. The deposit was worth it.', 5),
    ('Priya R.', 'Phoenix, AZ', 'Satellite analysis matched what the crew measured on site.', 5)
) AS t(name, location, quote_text, rating)
WHERE NOT EXISTS (SELECT 1 FROM testimonials LIMIT 1);
