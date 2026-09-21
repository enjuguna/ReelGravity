# ReelGravity

ReelGravity is an experimental physical movie-recommendation demo. You describe what you want to watch, and matching posters rise from a persistent Matter.js heap while non-matching posters return to the pile.

The project explores Jev’s structured evaluation model in a recommendation workflow. Jev evaluates movies against viewer preferences and ranks comparable options; it is used here for matching and scoring rather than open-ended chat generation.

## What is included

- A checked-in catalog of 75 verified TMDB movies.
- Natural-language parsing for runtime, year, genre, and movie-title constraints.
- Jev evaluation through Vercel AI Gateway with bounded batches, cancellation, caching, and local fallback ranking.
- Solo and two-person movie preferences.
- Persistent Matter.js physics with draggable posters and interruptible search transitions.
- Lazy facet scoring for movie details.
- Pins, seen/dismissed titles, undo, sharing, reduced-motion support, and browser persistence.

## Requirements

- Node.js 20 or newer
- pnpm
- A Vercel AI Gateway API key for live Jev evaluation
- A TMDB read access token only if you want to regenerate the catalog

## Run locally

```bash
pnpm install
copy .env.example .env.local
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

Add your Gateway key to `.env.local`:

```env
AI_GATEWAY_API_KEY=your_vercel_ai_gateway_key
```

The key is read by the server-side evaluation route and is never needed in browser code. If the key is missing or Jev is unavailable, the application can still show locally ranked, hard-filtered matches.

## Commands

```bash
pnpm dev        # Start the development server
pnpm typecheck  # Run TypeScript validation
pnpm build      # Create a production build
pnpm start      # Serve the production build
```

## Refresh the movie catalog

The checked-in catalog is stored in `lib/movies.ts`. To regenerate it from TMDB, set `TMDB_READ_ACCESS_TOKEN` in `.env.local` and run:

```bash
node scripts/import-tmdb.mjs
```

The importer validates that it produces exactly 75 unique movies with titles, years, runtimes, genres, overviews, poster paths, and normalized mood/pace/theme tags. It also updates the catalog version used to invalidate incompatible evaluation caches.

TMDB data and images are provided by [TMDB](https://www.themoviedb.org). ReelGravity is not endorsed or certified by TMDB.

## How search works

Search starts when a query is submitted with Enter or **Find my films**.

1. The shared query interpreter normalizes the request and extracts hard constraints such as `under 120 minutes`, `more than 120 minutes`, `past 2000`, and `between 90 and 120 minutes`.
2. Hard filters are applied locally before Jev is called.
3. Local ranking selects a high-recall primary candidate set while preserving exact-title and genre matches.
4. Jev evaluates the primary candidates in bounded batches through Vercel AI Gateway.
5. Weak or ambiguous searches can use a coverage group for additional recall.
6. Missing or delayed Jev scores use deterministic local ranking instead of breaking the shelf.
7. Results are reconciled by movie ID, so posters rise from their current heap positions and removed matches fall back naturally.

The API keeps the complete natural-language request for Jev so subjective intent is not reduced to only the locally parsed filters.

## Project structure

```text
app/page.tsx                 Client interaction and search state
app/api/evaluate/route.ts   Overall Jev evaluation and fallback ranking
app/api/evaluate/facets/    Lazy detail/facet evaluation
lib/query.ts                Shared query parsing and normalization
lib/ranking.ts              Local catalog indexing and candidate ranking
lib/jev.ts                  Jev state, questions, retries, and error handling
lib/physics-scene.ts        Fixed-step physics and transform optimizations
lib/movies.ts               Checked-in 75-title catalog
scripts/import-tmdb.mjs     TMDB catalog importer and validator
```

## Local state and sharing

Pins, seen/dismissed titles, preferences, filters, and current results are stored in browser local storage. The **Share mood** action encodes a session snapshot in the URL fragment and copies the link to the clipboard when browser permissions allow it.

Clearing the search removes the active query, filters, evaluations, and result shelf. Pins and seen/dismissed state are preserved. A later search starts a new physical transition from the current heap.

## Troubleshooting

### Jev results are not appearing

Confirm that `AI_GATEWAY_API_KEY` is set in `.env.local`, then restart the development server. Environment variables are loaded when Next.js starts. The server logs identify provider, authentication, billing, timeout, and invalid-request failures separately.

### The app shows local matches instead of Jev results

This is an intentional resilience path. The route applies hard filters and returns deterministic matches when Jev is unavailable, times out, or a request is superseded. Check the terminal logs for the underlying Gateway status and error type.

### Catalog changes are not reflected

Regenerate `lib/movies.ts` and confirm that `CATALOG_VERSION` changed. The catalog version is part of the evaluation cache key.

## License

This project is released under the MIT License. See [LICENSE](LICENSE).
