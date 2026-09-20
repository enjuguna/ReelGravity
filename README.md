# ReelGravity

ReelGravity is a physical movie recommender. Describe the feeling you want, and matching posters rise from a draggable heap. The evaluation route uses Jev through Vercel AI Gateway; the catalog is a checked-in snapshot so the interface can be explored without live movie discovery.

## Run locally

```bash
pnpm install
copy .env.example .env.local
pnpm dev
```

Add `AI_GATEWAY_API_KEY` to `.env.local` before submitting a mood. The key is read only by `app/api/evaluate/route.ts`. Without it, the app intentionally shows an actionable error rather than inventing scores. The optional TMDB token is only needed if you refresh the checked-in catalog with `node scripts/import-tmdb.mjs`.

The current catalog uses TMDB IDs and poster URLs. Keep the TMDB attribution in the interface when changing the catalog. For a production deployment, add rate limiting and a Gateway spend limit before exposing the evaluation route publicly.

## Interaction model

- Enter a mood and press Enter or **Find my films**.
- Refinements are appended to the session history; runtime phrases such as “under 100 minutes” become visible metadata filters.
- Toggle **Two-person night** to score the shared shortlist against both prompts.
- Pin a poster, mark it seen, inspect its AI-estimated breakdown, or use **Surprise me**.
- **Share mood** encodes the current snapshot in the URL fragment and copies it to the clipboard.
- **Clear** removes prompts and pins while keeping the session’s seen list; use browser storage reset to start completely fresh.

TMDB data and imagery are provided by [TMDB](https://www.themoviedb.org). ReelGravity is not endorsed or certified by TMDB.
