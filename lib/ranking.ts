import type { HardFilters, Movie, MovieEvaluation } from "./types";

const STOP_WORDS = new Set(["a", "an", "and", "for", "from", "i", "in", "me", "movie", "of", "the", "to", "with"]);
const INTENT_TAGS: Record<string, string[]> = {
  afternoon: ["warm", "hopeful", "lively", "absorbing"],
  cozy: ["warm", "hopeful", "family", "belonging"],
  funny: ["playful", "lively", "comedy"],
  fun: ["playful", "lively", "adventurous"],
  relaxing: ["measured", "absorbing", "warm"],
  sunday: ["warm", "hopeful", "measured"],
  thoughtful: ["thoughtful", "immersive", "measured"],
  romantic: ["romantic", "tender", "connection"],
  romance: ["romantic", "tender", "connection"],
  intense: ["intense", "propulsive", "kinetic"],
  adventurous: ["adventurous", "kinetic", "discovery"],
};

export const PRIMARY_CANDIDATE_LIMIT = 30;

function tokens(value: string) {
  return value.toLowerCase().split(/[^a-z0-9]+/).filter(token => token.length > 2 && !STOP_WORDS.has(token));
}

export function rankLocally(candidates: Movie[], query: string): MovieEvaluation[] {
  const queryTokens = tokens(query);
  const inferredTags = new Set(queryTokens.flatMap(token => INTENT_TAGS[token] ?? []));
  const scored = candidates.map(movie => {
    const titleTokens = new Set(tokens(movie.title));
    const genreTokens = new Set(movie.genres.flatMap(tokens));
    const metadataTokens = new Set([...movie.mood, ...movie.pace, ...movie.theme].flatMap(tokens));
    const overviewTokens = new Set(tokens(movie.overview));
    const overlap = (set: Set<string>) => queryTokens.length ? queryTokens.filter(token => set.has(token)).length / queryTokens.length : 0;
    const tagFit = inferredTags.size ? [...inferredTags].filter(tag => [...metadataTokens].includes(tag)).length / inferredTags.size : 0;
    const raw = queryTokens.length ? 0.48 + overlap(titleTokens) * 0.25 + overlap(genreTokens) * 0.2 + overlap(metadataTokens) * 0.2 + overlap(overviewTokens) * 0.08 + tagFit * 0.18 : 0.5;
    const overall = Math.max(0, Math.min(1, raw));
    return { movieId: movie.id, overall, mood: overall, pace: overall, theme: overall, eligible: overall >= 0.6 } satisfies MovieEvaluation;
  });
  return scored.sort((a, b) => b.overall - a.overall || a.movieId - b.movieId);
}

/** Pick a high-recall Jev set while retaining a deterministic reserve for coverage. */
export function selectPrimaryCandidates(candidates: Movie[], query: string) {
  const ranked = rankLocally(candidates, query);
  const queryTokens = new Set(tokens(query));
  const exact = ranked.filter(item => {
    const movie = candidates.find(candidate => candidate.id === item.movieId);
    if (!movie) return false;
    const titleTokens = tokens(movie.title);
    return titleTokens.some(token => queryTokens.has(token));
  });
  const chosen = new Set<number>();
  const primary: Movie[] = [];
  const byId = new Map(candidates.map(movie => [movie.id, movie]));
  const add = (movie: Movie | undefined) => {
    if (movie && !chosen.has(movie.id) && primary.length < PRIMARY_CANDIDATE_LIMIT) {
      chosen.add(movie.id);
      primary.push(movie);
    }
  };
  exact.forEach(item => add(byId.get(item.movieId)));
  const genreBuckets = new Map<string, Movie[]>();
  ranked.forEach(item => {
    const movie = byId.get(item.movieId);
    movie?.genres.forEach(genre => genreBuckets.set(genre, [...(genreBuckets.get(genre) ?? []), movie]));
  });
  for (const bucket of genreBuckets.values()) add(bucket[0]);
  ranked.forEach(item => add(byId.get(item.movieId)));
  return { primary, coverage: ranked.map(item => byId.get(item.movieId)!).filter(movie => !chosen.has(movie.id)), ranked };
}

export function fallbackEligible(candidates: Movie[], query: string) {
  const ranked = rankLocally(candidates, query);
  const eligible = ranked.filter(item => item.eligible);
  if (eligible.length) return { evaluations: ranked, ids: eligible.map(item => item.movieId) };
  const rescue = ranked.slice(0, Math.min(6, ranked.length)).map(item => ({ ...item, eligible: true, overall: Math.max(item.overall, 0.6), mood: Math.max(item.mood, 0.6), pace: Math.max(item.pace, 0.6), theme: Math.max(item.theme, 0.6) }));
  const byId = new Map(ranked.map(item => [item.movieId, item]));
  rescue.forEach(item => byId.set(item.movieId, item));
  return { evaluations: [...byId.values()].sort((a, b) => b.overall - a.overall || a.movieId - b.movieId), ids: rescue.map(item => item.movieId) };
}

export function applyHardFilters(movies: Movie[], filters: HardFilters, excludedIds: Set<number>) {
  return movies.filter(movie => !excludedIds.has(movie.id) && (!filters.runtimeMax || movie.runtime <= filters.runtimeMax) && (!filters.runtimeMin || movie.runtime >= filters.runtimeMin) && (!filters.yearMin || movie.year >= filters.yearMin) && (!filters.yearMax || movie.year <= filters.yearMax) && (!filters.genre || movie.genres.includes(filters.genre)));
}
