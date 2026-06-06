# RoofCapture Quote

Full-stack lead-capture + instant quote app for roofing companies built with Next.js, Tailwind, Supabase, Stripe, Google Maps, and AI vision.

## Setup

1. Copy `.env.example` to `.env.local` and fill values.
2. Create a Supabase project and run `supabase/schema.sql` in SQL Editor.
3. Install deps: `npm install`
4. Start app: `npm run dev`

## Core routes

- Public flow: `/` -> `/analyzing?leadId=...` -> `/quote/:id` -> `/book/:id` -> `/confirmation/:id`
- Admin dashboard: `/admin`
- APIs under `/api/*` for leads, bookings, admin data, and reminders.
