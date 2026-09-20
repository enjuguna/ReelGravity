import { writeFile } from "node:fs/promises";

const token = process.env.TMDB_READ_ACCESS_TOKEN;
if (!token) throw new Error("Set TMDB_READ_ACCESS_TOKEN before importing.");

const seedIds = [
  // Preserve every title from the 30-movie demo catalog first.
  550, 11, 13, 155, 157336, 19995, 920, 862, 508442, 354912,
  129, 207703, 497, 680, 603, 278, 694, 597, 120467, 603692,
  372058, 438631, 389, 284054, 634649, 27205, 24428, 293660, 299536, 118340,
  // Additional high-signal titles used to fill the expanded catalog.
  272, 424, 335983, 19404, 11216, 152601, 77338, 696374,
  102651, 15121, 50014, 424694, 568332, 37247, 313369, 244786,
  4247, 550524, 240, 4977, 109445, 49026, 8587, 120
];
const headers = { Authorization: `Bearer ${token}` };

async function api(path) {
  const response = await fetch(`https://api.themoviedb.org/3${path}`, { headers });
  if (!response.ok) throw new Error(`TMDB ${response.status} for ${path}`);
  return response.json();
}

function tags(genres) {
  const lower = genres.map(genre => genre.toLowerCase());
  const has = value => lower.includes(value);
  return {
    mood: has("horror") ? ["dark", "tense"] : has("comedy") ? ["playful", "warm"] : has("animation") ? ["wonder", "hopeful"] : has("romance") ? ["romantic", "tender"] : has("action") ? ["intense", "adventurous"] : ["thoughtful", "immersive"],
    pace: has("action") || has("thriller") ? ["propulsive", "kinetic"] : has("comedy") || has("animation") ? ["brisk", "lively"] : ["measured", "absorbing"],
    theme: has("family") ? ["family", "belonging"] : has("science fiction") ? ["discovery", "future"] : has("crime") ? ["justice", "consequence"] : ["identity", "connection"],
  };
}

const discovered = [];
for (let page = 1; page <= 8 && discovered.length < 50; page += 1) {
  const data = await api(`/discover/movie?include_adult=false&include_video=false&language=en-US&page=${page}&sort_by=vote_count.desc&vote_count.gte=5000`);
  discovered.push(...data.results.map(movie => movie.id));
}
const ids = [...new Set([...seedIds, ...discovered])].slice(0, 50);
const details = await Promise.all(ids.map(id => api(`/movie/${id}?language=en-US`)));
const movies = details.filter(movie => movie.poster_path && movie.title && movie.release_date).map(movie => {
  const genres = movie.genres.map(genre => genre.name).filter(Boolean);
  return { id: movie.id, title: movie.title, year: Number(movie.release_date.slice(0, 4)), runtime: movie.runtime || 0, genres, overview: movie.overview || `${movie.title} (${movie.release_date.slice(0, 4)}).`, posterPath: `https://image.tmdb.org/t/p/w342${movie.poster_path}`, ...tags(genres) };
});
if (movies.length !== 50 || new Set(movies.map(movie => movie.id)).size !== 50) throw new Error(`Expected 50 unique movies, received ${movies.length}.`);

const file = `import type { Movie } from "./types";\n\nexport const CATALOG_VERSION = "2026.09-50";\nexport const movies: Movie[] = ${JSON.stringify(movies, null, 2)};\nexport function getMovie(id: number) { return movies.find(movie => movie.id === id); }\n`;
await writeFile(new URL("../lib/movies.ts", import.meta.url), file);
console.log(`Imported ${movies.length} verified TMDB movies.`);
