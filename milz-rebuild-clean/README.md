
# milz-map-experience

Clean rebuild for the Map × Experience app.

## Stack
- React + Vite + TypeScript
- Leaflet
- Supabase (Auth / Postgres)
- Cloudflare Pages Functions
- Cloudflare R2 for spot images

## Setup
1. Copy `.env.example` to `.env.local` and fill the Supabase values.
2. In Supabase SQL editor, run `supabase/schema.sql`.
3. In Cloudflare Pages, bind the R2 bucket as `ASSETS` and add env vars:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `GEMINI_API_KEY`
   - `R2_PUBLIC_BASE_URL`
4. If the app lives in a nested folder, set Cloudflare Pages Root directory accordingly.

## Local
```bash
npm install
npm run dev
```

## Build
```bash
npm run build
```
