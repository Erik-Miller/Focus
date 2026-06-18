import { DEFAULT_MONITORING_CONFIG, type DwellInput, type MonitoringConfig } from "@focus/shared";
import { callables } from "./firebase";
import { createClientObservationId, saveObservationImages } from "./localObservationImages";

const ERROR_BACKOFF_MS = 2 * 60_000;
const QUOTA_BACKOFF_MS = 10 * 60_000;
const FINAL_FLUSH_RETRY_MS = 1_500;
const FINAL_FLUSH_MAX_ATTEMPTS = 40;
export const MAX_PARALLEL_INGESTS = 3;

export type MonitoringPhase = "idle" | "buffering" | "analyzing";
type FlushResult = "flushed" | "failed";

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
 * natively) from the much slower agent reasoning rate via fixed-size batches,
 * parallel raw ingest, and a single synthesis writer.
 */
export class MonitoringController {
  private buffer: DwellInput[] = [];
  private interval: number;
  private lastSynthesis = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private ingestingBatches = new Map<string, LiveTimelineBatch>();
  private ingestPromises = new Set<Promise<FlushResult>>();
  private ingestRetryUntil = 0;
  private synthesizing = false;
  private synthesisPromise: Promise<void> | null = null;
  private pendingHighNovelty = false;
  private stopping = false;

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
    this.stopping = false;
    this.lastSynthesis = Date.now();
    this.emitStatus("idle");
    this.timer = setInterval(() => {
      this.startAvailableIngests(false);
      void this.maybeSynthesize(false, "timer");
    }, 1000);
  }

  async stop(): Promise<void> {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;

    let attempts = 0;
    while (this.buffer.length > 0 || this.ingestPromises.size > 0) {
      attempts += 1;
      if (attempts > FINAL_FLUSH_MAX_ATTEMPTS) break;
      this.startAvailableIngests(true, true);
      if (this.ingestPromises.size > 0) {
        await Promise.race(Array.from(this.ingestPromises));
      } else if (this.buffer.length > 0) {
        await delay(FINAL_FLUSH_RETRY_MS);
      }
    }

    void this.maybeSynthesize(true, "stop");
    this.emitStatus("idle");
  }

  discard(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.buffer = [];
    this.ingestingBatches.clear();
    this.emitLiveBatches();
    this.emitStatus("idle");
  }

  push(dwell: DwellInput): void {
    const captured: DwellInput = {
      ...dwell,
      clientObservationId: dwell.clientObservationId ?? createClientObservationId(),
    };
    void saveObservationImages(this.sessionId, captured).catch((err) => {
      console.warn("Failed to save local observation image", err);
    });
    this.buffer.push(captured);
    this.emitLiveBatches();
    this.emitStatusForCurrentState();
    this.startAvailableIngests(false);
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

    for (const [id, batch] of this.ingestingBatches) {
      const remaining = batch.observations.filter(
        (observation) => !observationIds.has(observation.id),
      );
      if (remaining.length === 0) {
        this.ingestingBatches.delete(id);
        changed = true;
      } else if (remaining.length !== batch.observations.length) {
        this.ingestingBatches.set(id, {
          ...batch,
          observations: remaining,
          updatedAt: Date.now(),
        });
        changed = true;
      }
    }

    if (changed) this.emitLiveBatches();
  }

  private startAvailableIngests(force: boolean, ignoreBackoff = false): void {
    if (!ignoreBackoff && Date.now() < this.ingestRetryUntil) return;
    while (this.ingestPromises.size < MAX_PARALLEL_INGESTS) {
      if (this.buffer.length === 0) break;
      if (!force && this.buffer.length < this.cfg.maxBatch) break;
      const batch = this.buffer.splice(0, this.cfg.maxBatch);
      if (batch.length === 0) break;
      this.startIngest(batch);
    }
  }

  private startIngest(batch: DwellInput[]): void {
    const id = `ingesting:${batch[0]?.clientObservationId ?? Date.now()}`;
    this.pendingHighNovelty ||= batch.some((d) => d.novelty === "high");
    this.ingestingBatches.set(id, liveBatchFromDwells(id, "analyzing", batch));
    this.emitLiveBatches();
    this.emitStatusForCurrentState(batch.length);

    const ingest = this.ingestBatch(id, batch);
    this.ingestPromises.add(ingest);
    void ingest.finally(() => {
      this.ingestPromises.delete(ingest);
      this.emitStatusForCurrentState();
      this.startAvailableIngests(false);
    });
  }

  private async ingestBatch(id: string, batch: DwellInput[]): Promise<FlushResult> {
    try {
      const mode = await this.sendIngestBatch(batch);
      if (mode === "ingested" && !this.stopping) void this.maybeSynthesize(true, "timer");
      return "flushed";
    } catch (err) {
      // Re-queue the batch, but do not hammer the callable when provider quota
      // is exhausted or persistence is temporarily rejecting requests.
      this.buffer.unshift(...batch);
      this.ingestRetryUntil =
        Date.now() +
        (isQuotaError(err)
          ? QUOTA_BACKOFF_MS
          : Math.min(Math.max(this.interval * 1.5, ERROR_BACKOFF_MS), QUOTA_BACKOFF_MS));
      console.error("ingestObservations failed", err);
      return "failed";
    } finally {
      this.ingestingBatches.delete(id);
      this.emitLiveBatches();
      this.emitStatusForCurrentState();
    }
  }

  private async sendIngestBatch(batch: DwellInput[]): Promise<"ingested" | "compat"> {
    try {
      await callables.ingestObservations({
        sessionId: this.sessionId,
        observations: batch,
      });
      return "ingested";
    } catch (err) {
      if (!isMissingCallableError(err)) throw err;
      console.warn("ingestObservations unavailable; falling back to processObservations", err);
      const res = await callables.processObservations({
        sessionId: this.sessionId,
        observations: batch,
      });
      const data = res.data;
      if (data?.currentIntent && this.onResult) {
        this.onResult(data.currentIntent, data.confidence ?? 0);
      }
      return "compat";
    }
  }

  private async maybeSynthesize(force: boolean, reason: "timer" | "stop"): Promise<void> {
    if (this.synthesizing) return this.synthesisPromise ?? undefined;
    const elapsed = Date.now() - this.lastSynthesis;
    if (!force && elapsed < this.interval) return;

    const synthesis = this.synthesize(reason);
    this.synthesisPromise = synthesis;
    this.synthesizing = true;
    this.emitStatusForCurrentState();
    try {
      await synthesis;
    } finally {
      if (this.synthesisPromise === synthesis) this.synthesisPromise = null;
      this.synthesizing = false;
      this.emitStatusForCurrentState();
    }
  }

  private async synthesize(reason: "timer" | "stop"): Promise<void> {
    try {
      const res = await callables.synthesizePendingObservations({
        sessionId: this.sessionId,
        reason,
      });
      const data = res.data;
      this.lastSynthesis = Date.now();
      if (data?.currentIntent && this.onResult) {
        this.onResult(data.currentIntent, data.confidence ?? 0);
      }
      if (data?.interpreted) {
        this.interval = this.pendingHighNovelty
          ? this.cfg.minUpdateIntervalMs
          : Math.min(this.interval * 1.5, this.cfg.idleBackoffMaxMs);
        this.pendingHighNovelty = false;
      }
    } catch (err) {
      this.lastSynthesis = Date.now();
      this.interval = isQuotaError(err)
        ? QUOTA_BACKOFF_MS
        : Math.min(Math.max(this.interval * 1.5, ERROR_BACKOFF_MS), QUOTA_BACKOFF_MS);
      console.error("synthesizePendingObservations failed", err);
    }
  }

  private emitStatus(phase: MonitoringPhase, batchCount?: number): void {
    this.onStatus?.({
      phase,
      bufferCount: this.buffer.length,
      batchCount,
    });
  }

  private emitStatusForCurrentState(batchCount?: number): void {
    const phase: MonitoringPhase =
      this.synthesizing || this.ingestingBatches.size > 0
        ? "analyzing"
        : this.buffer.length > 0
          ? "buffering"
          : "idle";
    this.emitStatus(phase, batchCount);
  }

  private emitLiveBatches(): void {
    this.onLiveBatches?.(this.liveTimelineBatches());
  }

  private liveTimelineBatches(): LiveTimelineBatch[] {
    const batches: LiveTimelineBatch[] = [];
    for (const batch of this.ingestingBatches.values()) {
      if (batch.observations.length > 0) batches.push(batch);
    }
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

function isMissingCallableError(err: unknown): boolean {
  const code = typeof err === "object" && err && "code" in err ? String(err.code) : "";
  const message = typeof err === "object" && err && "message" in err ? String(err.message) : "";
  return code === "not-found" || code === "functions/not-found" || /not[- _]?found/i.test(message);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
