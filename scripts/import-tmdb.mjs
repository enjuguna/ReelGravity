/* Optional catalog refresh. The checked-in snapshot keeps the showcase runnable offline.
 * Run with: TMDB_READ_ACCESS_TOKEN=... node scripts/import-tmdb.mjs
 */
const token=process.env.TMDB_READ_ACCESS_TOKEN;
if(!token){ console.error("Set TMDB_READ_ACCESS_TOKEN before importing."); process.exit(1); }
console.log("TMDB import scaffold ready. Select the curated IDs in lib/movies.ts and map /movie/:id responses into the Movie shape.");
