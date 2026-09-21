import type { HardFilters, Movie, QueryIntent } from "./types";

const GENRES = ["animation", "drama", "comedy", "action", "adventure", "science fiction", "romance", "thriller", "family", "horror", "crime", "fantasy", "music", "mystery"];
const STOP_WORDS = new Set(["a", "an", "and", "for", "from", "i", "in", "me", "movie", "movies", "of", "the", "to", "with", "film", "films"]);
const HINTS: Record<string, string[]> = { romantic: ["romantic", "tender", "connection"], romance: ["romantic", "tender", "connection"], cozy: ["warm", "hopeful", "belonging"], funny: ["playful", "lively"], relaxing: ["measured", "absorbing"], thoughtful: ["thoughtful", "immersive"], adventurous: ["adventurous", "discovery"], intense: ["intense", "propulsive", "kinetic"] };

function tokenize(value: string) { return value.toLowerCase().split(/[^a-z0-9]+/).filter(token => token.length > 2 && !STOP_WORDS.has(token)); }
function number(value: string | undefined) { return value ? Number(value) : undefined; }

export function parseQueryIntent(raw: string, catalog: Movie[]): QueryIntent {
  const normalized = raw.trim().replace(/\s+/g, " ").toLowerCase();
  const terms = tokenize(normalized);
  const betweenRuntime = normalized.match(/between\s*(\d+)\s*(?:and|-)\s*(\d+)\s*(?:min|minutes)?/i);
  const maxRuntimeExclusive = normalized.match(/(?:under|below|less than|<)\s*(\d+)\s*(?:min|minutes)?/i)?.[1];
  const maxRuntimeInclusive = normalized.match(/(?:at most|no more than|<=)\s*(\d+)\s*(?:min|minutes)?/i)?.[1];
  const minRuntimeExclusive = normalized.match(/(?:over|more than|longer than|>)\s*(\d+)\s*(?:min|minutes)?/i)?.[1];
  const minRuntimeInclusive = normalized.match(/(?:at least|no less than|>=)\s*(\d+)\s*(?:min|minutes)?/i)?.[1];
  const afterYear = normalized.match(/(?:past|after)\s*((?:19|20)\d{2})/i)?.[1];
  const sinceYear = normalized.match(/(?:since|from)\s*((?:19|20)\d{2})/i)?.[1];
  const beforeYear = normalized.match(/(?:before|prior to|earlier than)\s*((?:19|20)\d{2})/i)?.[1];
  const genres = GENRES.filter(genre => normalized.includes(genre));
  const titleCandidates = catalog.filter(movie => {
    const title = movie.title.toLowerCase();
    return title === normalized || (normalized.length >= 4 && title.includes(normalized));
  }).map(movie => movie.id);
  const semanticHints = [...new Set(terms.flatMap(term => HINTS[term] ?? []))];
  const filters: HardFilters = {
    ...(betweenRuntime ? { runtimeMin: number(betweenRuntime[1]), runtimeMax: number(betweenRuntime[2]) } : {}),
    ...(!betweenRuntime && (maxRuntimeExclusive || maxRuntimeInclusive) ? { runtimeMax: number(maxRuntimeExclusive ?? maxRuntimeInclusive) } : {}),
    ...(!betweenRuntime && (minRuntimeExclusive || minRuntimeInclusive) ? { runtimeMin: minRuntimeExclusive ? number(minRuntimeExclusive)! + 1 : number(minRuntimeInclusive) } : {}),
    ...(afterYear ? { yearMin: number(afterYear)! + 1 } : {}),
    ...(!afterYear && sinceYear ? { yearMin: number(sinceYear) } : {}),
    ...(beforeYear ? { yearMax: number(beforeYear)! - 1 } : {}),
    ...(genres.length === 1 ? { genre: genres[0].replace(/\b\w/g, char => char.toUpperCase()) } : {}),
  };
  const constraintCount = Object.keys(filters).length + titleCandidates.length;
  const confidence = Math.min(1, 0.35 + constraintCount * 0.12 + (semanticHints.length ? 0.12 : 0));
  return { raw, normalized, terms, ...filters, genres, titleCandidates, semanticHints, confidence };
}

export function queryFilters(intent: QueryIntent): HardFilters {
  const filters: HardFilters = {};
  if (intent.runtimeMin !== undefined) filters.runtimeMin = intent.runtimeMin;
  if (intent.runtimeMax !== undefined) filters.runtimeMax = intent.runtimeMax;
  if (intent.yearMin !== undefined) filters.yearMin = intent.yearMin;
  if (intent.yearMax !== undefined) filters.yearMax = intent.yearMax;
  if (intent.genres.length === 1) filters.genre = intent.genres[0].replace(/\b\w/g, char => char.toUpperCase());
  return filters;
}
