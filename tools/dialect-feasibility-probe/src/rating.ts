import { z } from "zod";

/** A1.3: 20 native listeners rate each candidate synthesis voice, 1-5, on accent authenticity. */
export const listenerRatingSchema = z.object({
  listenerId: z.string().min(1),
  voiceId: z.string().min(1),
  score: z.number().int().min(1).max(5),
});
export type ListenerRating = z.infer<typeof listenerRatingSchema>;

export interface VoiceRatingSummary {
  readonly voiceId: string;
  readonly listenerCount: number;
  readonly meanScore: number;
}

const REQUIRED_LISTENER_COUNT = 20;

export function summarizeVoiceRatings(
  ratings: readonly ListenerRating[],
  options: { readonly enforceListenerCount: boolean } = { enforceListenerCount: true },
): VoiceRatingSummary[] {
  const byVoice = new Map<string, ListenerRating[]>();
  for (const rating of ratings) {
    const existing = byVoice.get(rating.voiceId) ?? [];
    existing.push(rating);
    byVoice.set(rating.voiceId, existing);
  }

  const summaries: VoiceRatingSummary[] = [];
  for (const [voiceId, voiceRatings] of byVoice) {
    const uniqueListeners = new Set(voiceRatings.map((r) => r.listenerId));
    if (options.enforceListenerCount && uniqueListeners.size < REQUIRED_LISTENER_COUNT) {
      throw new Error(
        `A1.3 requires ${REQUIRED_LISTENER_COUNT} listeners per voice; "${voiceId}" has ${uniqueListeners.size}.`,
      );
    }
    const mean = voiceRatings.reduce((sum, r) => sum + r.score, 0) / voiceRatings.length;
    summaries.push({ voiceId, listenerCount: uniqueListeners.size, meanScore: mean });
  }

  return summaries.sort((a, b) => b.meanScore - a.meanScore);
}
