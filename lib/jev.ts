import { experimental_evaluate as evaluate } from "ai";
import type { Experimental_EvaluationQuestion } from "ai";
import type { HardFilters, Movie } from "./types";

export const dimensions = ["mood", "pace", "theme"] as const;
export const SCORE_CRITERIA = ["Does not fit", "Weak fit", "Partial fit", "Good fit", "Excellent fit"];

export function createState(preferences: string[], candidates: Movie[], filters: HardFilters, mode: "solo" | "duo") {
  return { mode, filters, viewers: preferences.map((request, id) => ({ id, request })), movies: candidates.map(({ id, title, year, runtime, genres, overview, mood, pace, theme }) => ({ id, title, year, runtime, genres, overview, mood, pace, theme })) };
}

export function facetQuestions(candidates: Movie[]) {
  return Object.fromEntries(candidates.flatMap(movie => dimensions.map(dimension => [`m${movie.id}_${dimension}`, { type: "score" as const, criteria: SCORE_CRITERIA, instructions: `Evaluate ONLY movie ID ${movie.id} for the ${dimension} fit requested by every viewer. Use the movie facts in shared state, honor hard constraints, and use the weaker viewer fit in duo mode.` }]))) as Record<string, { type: "score"; criteria: string[]; instructions: string }>;
}

export function errorDetails(error: unknown) {
  const value = error as { name?: string; message?: string; statusCode?: number; generationId?: string; cause?: unknown; responseHeaders?: Record<string, string>; providerMetadata?: unknown };
  const cause = value.cause as { statusCode?: number; message?: string; responseHeaders?: Record<string, string> } | undefined;
  return { name: value.name, status: value.statusCode ?? cause?.statusCode, message: value.message ?? cause?.message, generationId: value.generationId, retryAfter: value.responseHeaders?.["retry-after"] ?? cause?.responseHeaders?.["retry-after"], providerMetadata: value.providerMetadata };
}

export function isRetryableProviderError(details: ReturnType<typeof errorDetails>) {
  return details.status === 424 || details.status === 502 || details.status === 503 || details.status === 504 || /failed_dependency|service_unavailable|temporarily unavailable/i.test(details.name ?? "") || /failed dependency|service temporarily unavailable/i.test(details.message ?? "");
}

export function scoreFromAnswer(answer: unknown) {
  const score = (answer as { score?: unknown } | undefined)?.score;
  if (!Number.isFinite(score) || Number(score) < 0 || Number(score) > 4) throw new Error("Invalid Jev score received.");
  return Number(score) / 4;
}

export async function evaluateStage(stage: string, state: ReturnType<typeof createState>, questions: Record<string, Experimental_EvaluationQuestion>, request: Request, deadline: AbortSignal, requestId: string, batchIndex: number) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const started = Date.now();
    try {
      const result = await evaluate({ model: "typesafe-ai/jev", state, questions, maxRetries: 0, providerOptions: { gateway: { sort: "ttft", caching: "auto", tags: ["feature:reelgravity", `stage:${stage}`] } }, abortSignal: AbortSignal.any([request.signal, deadline, AbortSignal.timeout(8_500)]) });
      console.info("[jev] success", { requestId, stage, batchIndex, attempt: attempt + 1, questionCount: Object.keys(questions).length, durationMs: Date.now() - started, providerMetadata: result.providerMetadata });
      return result;
    } catch (error) {
      const details = errorDetails(error);
      const retryable = isRetryableProviderError(details);
      console.error("[jev] failure", { requestId, stage, batchIndex, attempt: attempt + 1, questionCount: Object.keys(questions).length, durationMs: Date.now() - started, retryable, ...details });
      if (!retryable || attempt === 1 || request.signal.aborted || deadline.aborted) throw error;
      await new Promise<void>((resolve, reject) => { const timer = setTimeout(resolve, 120 + Math.random() * 180); const abort = () => { clearTimeout(timer); reject(request.signal.reason); }; request.signal.addEventListener("abort", abort, { once: true }); });
    }
  }
  throw new Error(`Jev ${stage} evaluation failed.`);
}
