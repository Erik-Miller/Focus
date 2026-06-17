import { DEFAULT_MONITORING_CONFIG, type DwellInput, type MonitoringConfig } from "@focus/shared";
import { callables } from "./firebase";
import { createClientObservationId, saveObservationImages } from "./localObservationImages";

const ERROR_BACKOFF_MS = 2 * 60_000;
const QUOTA_BACKOFF_MS = 10 * 60_000;
const FINAL_FLUSH_RETRY_MS = 1_500;
const FINAL_FLUSH_MAX_ATTEMPTS = 40;

export type MonitoringPhase = "idle" | "buffering" | "analyzing";
type FlushResult = "flushed" | "skipped" | "failed" | "deferred";

export interface MonitoringStatus {
  phase: MonitoringPhase;
  bufferCount: number;
  batchCount?: number;
}

export type LiveTimelineStatus = "captured" | "analyzing";

export interface LiveTimelineObservation {
  id: string;
  timestamp: number;
  app: string;
  windowTitle: string;
  mouse: { x: number; y: number };
  dwellMs: number;
  novelty: DwellInput["novelty"];
  frameHash: string;
  fullScreenshotDataUrl?: string;
  cursorCropDataUrl?: string;
}

export interface LiveTimelineBatch {
  id: string;
  status: LiveTimelineStatus;
  observations: LiveTimelineObservation[];
  updatedAt: number;
}

/**
 * Client-side monitoring buffer (used by the desktop capture path).
 *
 * Decouples the high candidate-rate (fast 300ms dwells, already novelty-tagged
 * and deduped natively) from the much slower agent reasoning rate via fixed-size
 * batches and a single in-flight flush.
 */
export class MonitoringController {
  private buffer: DwellInput[] = [];
  private interval: number;
  private lastFlush = 0;
  private flushing = false;
  private flushPromise: Promise<FlushResult> | null = null;
  private requireCurrentFlushInterpretation = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private analyzingBatch: LiveTimelineBatch | null = null;

  constructor(
    private readonly sessionId: string,
    private readonly cfg: MonitoringConfig = DEFAULT_MONITORING_CONFIG,
    private readonly onResult?: (intent: string, confidence: number) => void,
    private readonly onStatus?: (status: MonitoringStatus) => void,
    private readonly onLiveBatches?: (batches: LiveTimelineBatch[]) => void,
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

    let attempts = 0;
    while (this.buffer.length > 0 || this.flushing) {
      attempts += 1;
      const result = await this.maybeFlush(true, true);
      if (result === "failed") break;
      if (result === "deferred") {
        if (attempts >= FINAL_FLUSH_MAX_ATTEMPTS) break;
        await delay(FINAL_FLUSH_RETRY_MS);
        continue;
      }
      if (result === "skipped" && !this.flushing && this.buffer.length === 0) break;
      if (result === "skipped") {
        if (attempts >= FINAL_FLUSH_MAX_ATTEMPTS) break;
        await delay(FINAL_FLUSH_RETRY_MS);
      }
    }

    this.emitStatus("idle");
  }

  discard(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.buffer = [];
    this.analyzingBatch = null;
    this.emitLiveBatches();
    this.emitStatus("idle");
  }

  push(dwell: DwellInput): void {
    if (!hasCursorCrop(dwell)) {
      console.warn("Skipping dwell without cursor crop", {
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
    this.emitLiveBatches();
    this.emitStatus("buffering");
    if (this.buffer.length >= this.cfg.maxBatch) {
      void this.maybeFlush(true);
    }
  }

  getLiveTimelineBatches(): LiveTimelineBatch[] {
    return this.liveTimelineBatches();
  }

  acknowledgeObserved(observationIds: ReadonlySet<string>): void {
    let changed = false;

    const remainingBuffer = this.buffer.filter((dwell) => {
      const id = dwell.clientObservationId;
      return !id || !observationIds.has(id);
    });
    if (remainingBuffer.length !== this.buffer.length) {
      this.buffer = remainingBuffer;
      changed = true;
    }

    if (this.analyzingBatch) {
      const remaining = this.analyzingBatch.observations.filter((observation) => {
        return !observationIds.has(observation.id);
      });
      if (remaining.length === 0) {
        this.analyzingBatch = null;
        changed = true;
      } else if (remaining.length !== this.analyzingBatch.observations.length) {
        this.analyzingBatch = {
          ...this.analyzingBatch,
          observations: remaining,
          updatedAt: Date.now(),
        };
        changed = true;
      }
    }

    if (changed) this.emitLiveBatches();
  }

  private async maybeFlush(force: boolean, requireInterpretation = false): Promise<FlushResult> {
    if (this.flushing) {
      if (requireInterpretation) this.requireCurrentFlushInterpretation = true;
      return force && this.flushPromise ? this.flushPromise : "skipped";
    }
    if (this.buffer.length === 0) return "skipped";
    if (!force && this.buffer.length < this.cfg.maxBatch) return "skipped";
    const elapsed = Date.now() - this.lastFlush;
    if (!force && elapsed < this.interval) return "skipped";

    this.requireCurrentFlushInterpretation = requireInterpretation;
    const flush = this.flushNextBatch();
    this.flushPromise = flush;
    try {
      return await flush;
    } finally {
      if (this.flushPromise === flush) this.flushPromise = null;
    }
  }

  private async flushNextBatch(): Promise<FlushResult> {
    const batch = this.buffer.splice(0, this.cfg.maxBatch);
    const hadHigh = batch.some((d) => d.novelty === "high");
    this.flushing = true;
    this.analyzingBatch = liveBatchFromDwells(
      `analyzing:${batch[0]?.clientObservationId ?? Date.now()}`,
      "analyzing",
      batch,
    );
    this.emitLiveBatches();
    this.emitStatus("analyzing", batch.length);
    try {
      const res = await callables.processObservations({
        sessionId: this.sessionId,
        observations: batch,
      });
      this.lastFlush = Date.now();
      const data = res.data;
      if (this.requireCurrentFlushInterpretation && data?.interpreted === false) {
        this.analyzingBatch = null;
        this.buffer.unshift(...batch);
        return "deferred";
      }
      if (data?.currentIntent && this.onResult) {
        this.onResult(data.currentIntent, data.confidence ?? 0);
      }
      // Adaptive backoff: stable context slows down, novel context speeds up.
      this.interval = hadHigh
        ? this.cfg.minUpdateIntervalMs
        : Math.min(this.interval * 1.5, this.cfg.idleBackoffMaxMs);
      return "flushed";
    } catch (err) {
      // Re-queue the batch, but do not hammer the callable when provider quota
      // is exhausted or the model API is temporarily rejecting requests.
      this.analyzingBatch = null;
      this.buffer.unshift(...batch);
      this.lastFlush = Date.now();
      this.interval = isQuotaError(err)
        ? QUOTA_BACKOFF_MS
        : Math.min(Math.max(this.interval * 1.5, ERROR_BACKOFF_MS), QUOTA_BACKOFF_MS);
      console.error("processObservations failed", err);
      return "failed";
    } finally {
      this.flushing = false;
      this.requireCurrentFlushInterpretation = false;
      this.emitLiveBatches();
      this.emitStatus(this.buffer.length > 0 ? "buffering" : "idle");
      if (this.buffer.length >= this.cfg.maxBatch) {
        void this.maybeFlush(true);
      }
    }
  }

  private emitStatus(phase: MonitoringPhase, batchCount?: number): void {
    this.onStatus?.({
      phase,
      bufferCount: this.buffer.length,
      batchCount,
    });
  }

  private emitLiveBatches(): void {
    this.onLiveBatches?.(this.liveTimelineBatches());
  }

  private liveTimelineBatches(): LiveTimelineBatch[] {
    const batches: LiveTimelineBatch[] = [];
    if (this.analyzingBatch?.observations.length) batches.push(this.analyzingBatch);
    for (let index = 0; index < this.buffer.length; index += this.cfg.maxBatch) {
      const chunk = this.buffer.slice(index, index + this.cfg.maxBatch);
      if (chunk.length === 0) continue;
      batches.push(
        liveBatchFromDwells(
          `captured:${this.sessionId}:${index}:${chunk[0]?.clientObservationId ?? "pending"}`,
          "captured",
          chunk,
        ),
      );
    }
    return batches;
  }
}

function hasCursorCrop(dwell: DwellInput): boolean {
  return Boolean(dwell.cursorCropDataUrl);
}

function liveBatchFromDwells(
  id: string,
  status: LiveTimelineStatus,
  dwells: DwellInput[],
): LiveTimelineBatch {
  return {
    id,
    status,
    observations: dwells.map(liveObservationFromDwell),
    updatedAt: Date.now(),
  };
}

function liveObservationFromDwell(dwell: DwellInput): LiveTimelineObservation {
  return {
    id: dwell.clientObservationId ?? createClientObservationId(),
    timestamp: dwell.timestamp,
    app: dwell.app,
    windowTitle: dwell.windowTitle,
    mouse: dwell.mouse,
    dwellMs: dwell.dwellMs,
    novelty: dwell.novelty,
    frameHash: dwell.frameHash,
    fullScreenshotDataUrl: dwell.fullScreenshotDataUrl,
    cursorCropDataUrl: dwell.cursorCropDataUrl,
  };
}

function isQuotaError(err: unknown): boolean {
  const code = typeof err === "object" && err && "code" in err ? String(err.code) : "";
  const message = typeof err === "object" && err && "message" in err ? String(err.message) : "";
  return code.includes("resource-exhausted") || /quota|too many requests|429/i.test(message);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
