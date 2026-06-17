import { DEFAULT_MONITORING_CONFIG, type DwellInput, type MonitoringConfig } from "@focus/shared";
import { callables } from "./firebase";
import { createClientObservationId, saveObservationImages } from "./localObservationImages";

const ERROR_BACKOFF_MS = 2 * 60_000;
const QUOTA_BACKOFF_MS = 10 * 60_000;

export type MonitoringPhase = "idle" | "buffering" | "analyzing";

export interface MonitoringStatus {
  phase: MonitoringPhase;
  bufferCount: number;
  batchCount?: number;
}

/**
 * Client-side monitoring buffer (used by the desktop capture path).
 *
 * Decouples the high candidate-rate (fast 300ms dwells, already novelty-tagged
 * and deduped natively) from the much slower agent reasoning rate via batching,
 * a min cadence, adaptive backoff, and a single in-flight flush.
 */
export class MonitoringController {
  private buffer: DwellInput[] = [];
  private interval: number;
  private lastFlush = 0;
  private flushing = false;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly sessionId: string,
    private readonly cfg: MonitoringConfig = DEFAULT_MONITORING_CONFIG,
    private readonly onResult?: (intent: string, confidence: number) => void,
    private readonly onStatus?: (status: MonitoringStatus) => void,
  ) {
    this.interval = cfg.minUpdateIntervalMs;
  }

  start(): void {
    this.lastFlush = Date.now();
    this.emitStatus("idle");
    this.timer = setInterval(() => void this.maybeFlush(false), 1000);
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.maybeFlush(true);
    this.emitStatus("idle");
  }

  push(dwell: DwellInput): void {
    if (!hasCapturedScreenshots(dwell)) {
      console.warn("Skipping dwell without captured screenshots", {
        app: dwell.app,
        windowTitle: dwell.windowTitle,
        timestamp: dwell.timestamp,
      });
      return;
    }
    const captured: DwellInput = {
      ...dwell,
      clientObservationId: dwell.clientObservationId ?? createClientObservationId(),
    };
    void saveObservationImages(this.sessionId, captured).catch((err) => {
      console.warn("Failed to save local observation image", err);
    });
    this.buffer.push(captured);
    this.emitStatus("buffering");
    const highNovelty = dwell.novelty === "high";
    if (highNovelty || this.buffer.length >= this.cfg.maxBatch) {
      void this.maybeFlush(highNovelty);
    }
  }

  private async maybeFlush(force: boolean): Promise<void> {
    if (this.flushing || this.buffer.length === 0) return;
    const elapsed = Date.now() - this.lastFlush;
    if (!force && elapsed < this.interval) return;

    const batch = this.buffer.splice(0, this.cfg.maxBatch);
    const hadHigh = batch.some((d) => d.novelty === "high");
    this.flushing = true;
    this.emitStatus("analyzing", batch.length);
    try {
      const res = await callables.processObservations({
        sessionId: this.sessionId,
        observations: batch,
      });
      this.lastFlush = Date.now();
      const data = res.data;
      if (data?.currentIntent && this.onResult) {
        this.onResult(data.currentIntent, data.confidence ?? 0);
      }
      // Adaptive backoff: stable context slows down, novel context speeds up.
      this.interval = hadHigh
        ? this.cfg.minUpdateIntervalMs
        : Math.min(this.interval * 1.5, this.cfg.idleBackoffMaxMs);
    } catch (err) {
      // Re-queue the batch, but do not hammer the callable when provider quota
      // is exhausted or the model API is temporarily rejecting requests.
      this.buffer.unshift(...batch);
      this.lastFlush = Date.now();
      this.interval = isQuotaError(err)
        ? QUOTA_BACKOFF_MS
        : Math.min(Math.max(this.interval * 1.5, ERROR_BACKOFF_MS), QUOTA_BACKOFF_MS);
      console.error("processObservations failed", err);
    } finally {
      this.flushing = false;
      this.emitStatus(this.buffer.length > 0 ? "buffering" : "idle");
    }
  }

  private emitStatus(phase: MonitoringPhase, batchCount?: number): void {
    this.onStatus?.({
      phase,
      bufferCount: this.buffer.length,
      batchCount,
    });
  }
}

function hasCapturedScreenshots(dwell: DwellInput): boolean {
  return Boolean(dwell.fullScreenshotDataUrl && dwell.cursorCropDataUrl);
}

function isQuotaError(err: unknown): boolean {
  const code = typeof err === "object" && err && "code" in err ? String(err.code) : "";
  const message = typeof err === "object" && err && "message" in err ? String(err.message) : "";
  return code.includes("resource-exhausted") || /quota|too many requests|429/i.test(message);
}
