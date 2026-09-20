import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { CATALOG_VERSION, movies } from "@/lib/movies";
import { applyHardFilters } from "@/lib/ranking";
import { createState, dimensions, errorDetails, evaluateStage, facetQuestions, scoreFromAnswer } from "@/lib/jev";
import type { HardFilters } from "@/lib/types";

export const maxDuration = 18;
const CACHE_TTL = 15 * 60_000;
const cache = new Map<string, { expires: number; facetScores: Record<number, Record<typeof dimensions[number], number>> }>();

function queryHash(preferences: string[]) {
  return createHash("sha256").update(preferences.join("\u001f")).digest("hex").slice(0, 12);
}

export async function POST(request: Request) {
  const requestId = randomUUID();
  const started = Date.now();
  try {
    const body = await request.json() as Record<string, unknown>;
    const mode = body.mode === "duo" ? "duo" : "solo";
    const latest = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").at(-1)?.trim() ?? "" : "";
    const preferences = [latest(body.preferences), mode === "duo" ? latest(body.secondPreferences) : ""].filter(value => value.length >= 5);
    const filters: HardFilters = (body.filters && typeof body.filters === "object" ? body.filters : {}) as HardFilters;
    const requestedIds = Array.isArray(body.movieIds) ? body.movieIds.filter((id): id is number => typeof id === "number").slice(0, 6) : [];
    const candidates = applyHardFilters(movies, filters, new Set()).filter(movie => requestedIds.includes(movie.id));
    if (!preferences.length || !candidates.length) return NextResponse.json({ facetScores: {}, facetMovieIds: [], facetsComplete: true });
    const key = JSON.stringify([CATALOG_VERSION, preferences, mode, filters, requestedIds]);
    const cached = cache.get(key);
    if (cached && cached.expires > Date.now()) return NextResponse.json({ facetScores: cached.facetScores, facetMovieIds: Object.keys(cached.facetScores).map(Number), facetsComplete: true, cached: true });
    const result = await evaluateStage("facets", createState(preferences, candidates, filters, mode), facetQuestions(candidates), request, AbortSignal.timeout(14_000), requestId, 0);
    const facetScores = Object.fromEntries(candidates.map(movie => [movie.id, Object.fromEntries(dimensions.map(dimension => [dimension, scoreFromAnswer(result.answers[`m${movie.id}_${dimension}`])])) as Record<typeof dimensions[number], number>])) as Record<number, Record<typeof dimensions[number], number>>;
    cache.set(key, { expires: Date.now() + CACHE_TTL, facetScores });
    console.info("[jev] facets completed", { requestId, queryHash: queryHash(preferences), candidateCount: candidates.length, questionCount: candidates.length * dimensions.length, durationMs: Date.now() - started });
    return NextResponse.json({ facetScores, facetMovieIds: candidates.map(movie => movie.id), facetsComplete: true, cached: false });
  } catch (error) {
    if (request.signal.aborted) return new Response(null, { status: 499 });
    console.error("[jev] facets degraded", { requestId, ...errorDetails(error), durationMs: Date.now() - started });
    return NextResponse.json({ facetScores: {}, facetMovieIds: [], facetsComplete: false, detailMessage: "Detailed fit is unavailable; the overall match is still valid." });
  }
}
