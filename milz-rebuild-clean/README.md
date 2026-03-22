# Milz Map X Experience Rebuild

Clean rebuild starter for the map-first experience app.

## Scope
- Admin / User auth-ready structure
- Map / AI / Favorite / Profile bottom navigation
- Region dropdown master for Hawaii, New York, Tokyo, Kyoto, Osaka, Korea
- Admin spot registration scaffold
- Favorites scaffold
- AI request scaffold with separate Recommendation and Trend flows

## Run
```bash
npm install
npm run dev
```

## Important
This starter intentionally does **not** keep any legacy fallback logic.
Recommendation and Trend should only be filled by the new APIs.
