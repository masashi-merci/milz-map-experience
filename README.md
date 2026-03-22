# Milz Map X Experience - Phase 1

New clean rebuild for the map × experience app.

## Scope in this phase
- Supabase Auth scaffold (Admin / User)
- Spot CRUD UI scaffold
- Map click registration flow scaffold
- Favorites scaffold
- Cloudflare R2 upload flow scaffold
- Region master for Hawaii / New York / Tokyo / Kyoto / Osaka / Korea

## Environment variables
See `.env.example`.

## SQL
Run `supabase/schema.sql` in the existing Supabase project.

## Run
```bash
npm install
npm run dev
```

## Cloudflare Pages
Set **Root directory** to the app folder if the repo root contains an extra wrapper folder.
