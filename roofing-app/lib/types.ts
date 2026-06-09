export type LeadStatus = "quoted" | "booked" | "inspected" | "won" | "lost";

export type RoofType = "asphalt_shingle" | "metal" | "tile" | "flat";
export type RoofComplexity = "simple" | "moderate" | "complex";

export interface VisionAnalysis {
  roof_sqft: number;
  roof_area_sqm: number | null;
  roof_type: RoofType;
  complexity: RoofComplexity;
  confidence: number;
  roof_visible: boolean;
  fallback_reason: string | null;
  polygon_coordinates: Array<{ x: number; y: number }>;
}

export interface SettingsRow {
  id: number;
  company_name: string;
  company_phone: string;
  company_email: string;
  company_logo_url: string | null;
  company_address: string | null;
  primary_color: string;
  secondary_color: string;
  price_per_sqft_repair_low: number;
  price_per_sqft_repair_high: number;
  price_per_sqft_standard_low: number;
  price_per_sqft_standard_high: number;
  price_per_sqft_premium_low: number;
  price_per_sqft_premium_high: number;
  material_multiplier_metal: number;
  material_multiplier_tile: number;
  deposit_amount: number;
  currency_rate_gbp: number;
  currency_rate_aud: number;
  currency_rate_nzd: number;
  service_area_zip_codes: string[];
  stripe_publishable_key: string | null;
  stripe_secret_key: string | null;
  twilio_account_sid: string | null;
  twilio_auth_token: string | null;
  twilio_from_number: string | null;
  google_maps_api_key: string | null;
  facebook_pixel_id: string | null;
  google_ads_tag: string | null;
  email_template_quote_ready: string;
  email_template_booking_confirmed: string;
  email_template_inspection_reminder: string;
  owner_name: string;
}
