import { SettingsRow } from "@/lib/types";

export const DEFAULT_SETTINGS: Omit<SettingsRow, "id"> = {
  company_name: "Nimly",
  company_phone: "(555) 123-4567",
  company_email: "hello@nimly.tech",
  company_logo_url: null,
  company_address: "123 Main St, Springfield",
  primary_color: "#C8102E",
  secondary_color: "#1F2937",
  price_per_sqft_repair_low: 4,
  price_per_sqft_repair_high: 7,
  price_per_sqft_standard_low: 8,
  price_per_sqft_standard_high: 12,
  price_per_sqft_premium_low: 13,
  price_per_sqft_premium_high: 18,
  material_multiplier_metal: 1.4,
  material_multiplier_tile: 1.6,
  deposit_amount: 50,
  currency_rate_gbp: 0.79,
  currency_rate_aud: 1.53,
  currency_rate_nzd: 1.64,
  service_area_zip_codes: [],
  stripe_publishable_key: null,
  stripe_secret_key: null,
  twilio_account_sid: null,
  twilio_auth_token: null,
  twilio_from_number: null,
  google_maps_api_key: null,
  facebook_pixel_id: null,
  google_ads_tag: null,
  email_template_quote_ready:
    "Hi {{customer_name}}, your quote is ready. Estimated range: {{quote_range}}. Book here: {{booking_link}}",
  email_template_booking_confirmed:
    "Your inspection is confirmed for {{inspection_date}} at {{inspection_time}}.",
  email_template_inspection_reminder:
    "Reminder: your inspection is tomorrow at {{inspection_time}}.",
  owner_name: "Nimly Team",
};
