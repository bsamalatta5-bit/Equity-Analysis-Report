/** A5.4: per-turn latency instrumentation. One instance measures one turn. */
export class TurnLatencyRecorder {
  private startedAtMs: number | null = null;

  start(): void {
    this.startedAtMs = performance.now();
  }

  /** Returns the elapsed milliseconds since start() and resets for reuse. */
  stop(): number {
    if (this.startedAtMs === null) {
      throw new Error("TurnLatencyRecorder.stop() called without a matching start().");
    }
    const elapsedMs = performance.now() - this.startedAtMs;
    this.startedAtMs = null;
    return Math.round(elapsedMs);
  }
}

/** A5.4/A4.2-style p95: sorted, index = ceil(0.95 * n) - 1, matching the convention used across this codebase's other p95 checks. */
export function computeP95(latenciesMs: readonly number[]): number {
  if (latenciesMs.length === 0) {
    throw new Error("computeP95 requires at least one sample.");
  }
  const sorted = [...latenciesMs].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
  return sorted[index]!;
}
