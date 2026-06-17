import { useEffect, useState } from "react";
import { directAddressText, type Observation, type UsageAggregate } from "@focus/shared";
import { Card } from "@/components/ui/card";
import {
  loadObservationImages,
  type LocalObservationImages,
} from "../localObservationImages";
import type {
  LiveTimelineBatch,
  LiveTimelineObservation,
  LiveTimelineStatus,
} from "../monitoring";
import { UsageBar } from "./UsageBar";

export function Timeline({
  sessionId,
  observations,
  liveBatches = [],
  usage,
}: {
  sessionId?: string | null;
  observations: Observation[];
  liveBatches?: LiveTimelineBatch[];
  usage?: UsageAggregate;
}) {
  const [selectedEntry, setSelectedEntry] = useState<TimelineEntry | null>(null);
  const entries = buildTimelineEntries(observations, liveBatches);
  const observedCount = entries.reduce((total, entry) => total + entry.count, 0);
  const localImages = useLocalObservationImages(sessionId ?? null, observations);

  useEffect(() => {
    if (!selectedEntry) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setSelectedEntry(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedEntry]);

  if (entries.length === 0) {
    return (
      <Card className="timeline-card gap-0 overflow-hidden py-0">
        <TimelineHeader count={0} usage={usage} />
        <p className="empty">No observed moments yet.</p>
      </Card>
    );
  }
  return (
    <Card className="timeline-card gap-0 overflow-hidden py-0">
      <TimelineHeader count={observedCount} usage={usage} />
      <ul className="timeline">
        {entries.map((entry) => {
          const o = entry.latest;
          const pending = entry.status !== "analyzed";
          const statusLabel = statusLabelForEntry(entry);
          return (
            <li
              key={entry.id}
              className={`tl-item${pending ? " tl-item-pending" : ""}${
                entry.isBatch ? " tl-item-batch" : ""
              }`}
              data-status={entry.status}
            >
              {entry.isBatch ? (
                <TimelineImageStrip
                  entry={entry}
                  localImages={localImages}
                  onOpen={() => setSelectedEntry(entry)}
                />
              ) : (
                <TimelineThumb
                  observation={o}
                  status={entry.status}
                  localImages={localImages}
                  onOpen={() => setSelectedEntry(entry)}
                />
              )}
              <div className="tl-body">
                <div className="tl-title-row">
                  <div className="tl-title">{entry.title}</div>
                  <span className="tl-status" data-status={entry.status}>
                    {statusLabel}
                  </span>
                </div>
                <div className="tl-meta">
                  {entry.context && <span>{entry.context}</span>}
                  <span>{entry.timeLabel}</span>
                </div>
                {entry.summary ? (
                  <div key="summary" className="tl-summary">
                    {directAddressText(entry.summary)}
                  </div>
                ) : (
                  <div
                    key="pending"
                    className="tl-summary tl-summary-pending"
                    data-status={entry.status}
                  >
                    {pendingTextForEntry(entry)}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {selectedEntry && (
        <BatchImageTray
          entry={selectedEntry}
          localImages={localImages}
          onClose={() => setSelectedEntry(null)}
        />
      )}
    </Card>
  );
}

function TimelineHeader({ count, usage }: { count: number; usage?: UsageAggregate }) {
  return (
    <div className="panel-title timeline-title">
      <span className="timeline-title-main">
        Attention timeline {count > 0 && <span className="count">{count}</span>}
      </span>
      <UsageBar usage={usage} />
    </div>
  );
}

type TimelineEntryStatus = LiveTimelineStatus | "analyzed";
type TimelineObservation = (Observation | LiveTimelineObservation) & {
  cursorCropDataUrl?: string;
  fullScreenshotDataUrl?: string;
  cursorCropUrl?: string;
  fullScreenshotUrl?: string;
};

interface TimelineEntry {
  id: string;
  latest: TimelineObservation;
  observations: TimelineObservation[];
  count: number;
  isBatch: boolean;
  status: TimelineEntryStatus;
  title: string;
  context: string;
  timeLabel: string;
  summary: string;
}

function buildTimelineEntries(
  observations: Observation[],
  liveBatches: LiveTimelineBatch[],
): TimelineEntry[] {
  const observedIds = new Set(observations.map((observation) => observation.id));
  const entries: TimelineEntry[] = [];
  const groups = new Map<string, Observation[]>();
  for (const observation of observations) {
    const key = shouldGroupBatch(observation)
      ? `batch:${observation.batchId}`
      : `observation:${observation.id}`;
    const group = groups.get(key);
    if (group) group.push(observation);
    else groups.set(key, [observation]);
  }

  for (const [id, group] of groups) {
    entries.push(entryFromObservationGroup(id, group));
  }

  for (const batch of liveBatches) {
    const liveOnly = batch.observations.filter((observation) => !observedIds.has(observation.id));
    if (liveOnly.length > 0) entries.push(entryFromLiveBatch(batch, liveOnly));
  }

  return entries.sort((a, b) => a.latest.timestamp - b.latest.timestamp);
}

function shouldGroupBatch(observation: Observation): boolean {
  return Boolean(observation.batchId && observation.batchId !== "demo");
}

function entryFromObservationGroup(id: string, observations: Observation[]): TimelineEntry {
  const ordered = [...observations].sort((a, b) => a.timestamp - b.timestamp);
  const latest = ordered[ordered.length - 1];
  const status: TimelineEntryStatus = ordered.some((o) => !o.summary) ? "analyzing" : "analyzed";
  const count = ordered.length;
  const isBatch = id.startsWith("batch:");
  return {
    id,
    latest,
    observations: ordered,
    count,
    isBatch,
    status,
    title: titleForEntry(ordered, status, isBatch),
    context: contextForEntry(ordered),
    timeLabel: timeLabelForEntry(ordered),
    summary: status === "analyzed" ? latest.summary : "",
  };
}

function entryFromLiveBatch(
  batch: LiveTimelineBatch,
  observations: LiveTimelineObservation[],
): TimelineEntry {
  const ordered = [...observations].sort((a, b) => a.timestamp - b.timestamp);
  const latest = ordered[ordered.length - 1];
  return {
    id: `live:${batch.id}`,
    latest,
    observations: ordered,
    count: ordered.length,
    isBatch: true,
    status: batch.status,
    title: titleForEntry(ordered, batch.status, true),
    context: contextForEntry(ordered),
    timeLabel: timeLabelForEntry(ordered),
    summary: "",
  };
}

function titleForEntry(
  observations: TimelineObservation[],
  status: TimelineEntryStatus,
  isBatch: boolean,
): string {
  if (status === "captured") return "Captured activity";
  if (status === "analyzing" && isBatch) return "Analyzing activity";
  if (observations.length === 1) return displayTitle(observations[0]);
  return "Activity";
}

function contextForEntry(observations: TimelineObservation[]): string {
  const labels = unique(
    observations
      .map((o) => displayApp(o) || displayTitle(o))
      .filter((label) => label.trim().length > 0),
  );
  if (labels.length <= 2) return labels.join(", ");
  return `${labels.slice(0, 2).join(", ")} +${labels.length - 2}`;
}

function timeLabelForEntry(observations: TimelineObservation[]): string {
  const first = observations[0];
  const last = observations[observations.length - 1];
  const start = new Date(first.timestamp).toLocaleTimeString();
  const end = new Date(last.timestamp).toLocaleTimeString();
  return start === end ? start : `${start} - ${end}`;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function statusLabelForEntry(entry: TimelineEntry): string {
  return statusLabelForStatus(entry.status);
}

function statusLabelForStatus(status: TimelineEntryStatus): string {
  if (status === "captured") return "Captured";
  if (status === "analyzing") return "Analyzing";
  return "Analyzed";
}

function pendingTextForEntry(entry: TimelineEntry): string {
  if (entry.status === "captured") {
    return entry.count === 1
      ? "1 screenshot captured. Waiting for analysis..."
      : `${entry.count} screenshots captured. Waiting for analysis...`;
  }
  return entry.count === 1 ? "Analyzing 1 screenshot..." : `Analyzing ${entry.count} screenshots...`;
}

function TimelineThumb({
  observation,
  status,
  localImages,
  onOpen,
}: {
  observation: TimelineObservation;
  status: TimelineEntryStatus;
  localImages: Map<string, LocalObservationImages>;
  onOpen: () => void;
}) {
  const thumbUrl = thumbnailUrlForObservation(observation, localImages);
  const statusLabel = statusLabelForStatus(status).toLowerCase();
  return (
    <button
      type="button"
      className="tl-thumb"
      onClick={onOpen}
      aria-label={`Show ${statusLabel} image`}
    >
      {thumbUrl ? (
        <img src={thumbUrl} alt={observation.app} loading="lazy" />
      ) : (
        <div className="tl-thumb-empty" />
      )}
    </button>
  );
}

function TimelineImageStrip({
  entry,
  localImages,
  onOpen,
}: {
  entry: TimelineEntry;
  localImages: Map<string, LocalObservationImages>;
  onOpen: () => void;
}) {
  const visible = entry.observations.slice(-4);
  const extraCount = Math.max(0, entry.observations.length - visible.length);
  const statusLabel = statusLabelForEntry(entry).toLowerCase();

  return (
    <button
      type="button"
      className="tl-strip"
      onClick={onOpen}
      aria-label={`Show ${entry.count} ${statusLabel} image${entry.count === 1 ? "" : "s"}`}
    >
      {visible.map((observation) => {
        const imageUrl = thumbnailUrlForObservation(observation, localImages);
        return (
          <span className="tl-strip-frame" key={observation.id}>
            {imageUrl ? (
              <img src={imageUrl} alt={displayTitle(observation)} loading="lazy" />
            ) : (
              <span className="tl-strip-empty" />
            )}
          </span>
        );
      })}
      {extraCount > 0 && <span className="tl-strip-more">{entry.count}+</span>}
    </button>
  );
}

function BatchImageTray({
  entry,
  localImages,
  onClose,
}: {
  entry: TimelineEntry;
  localImages: Map<string, LocalObservationImages>;
  onClose: () => void;
}) {
  const title =
    entry.status === "captured"
      ? "Captured images"
      : entry.status === "analyzing"
        ? "Images being analyzed"
        : "Analyzed images";

  return (
    <div className="image-tray-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="image-tray"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="image-tray-head">
          <div>
            <div className="image-tray-title">{title}</div>
            <div className="image-tray-meta">{entry.timeLabel}</div>
          </div>
          <button type="button" className="image-tray-close" onClick={onClose} aria-label="Close">
            Close
          </button>
        </div>
        <div className="image-grid">
          {entry.observations.map((observation, index) => {
            const imageUrl = trayImageUrlForObservation(observation, localImages);
            return (
              <figure className="image-tile" key={observation.id}>
                {imageUrl ? (
                  <img src={imageUrl} alt={displayTitle(observation)} loading="lazy" />
                ) : (
                  <div className="image-tile-empty">
                    {entry.status === "captured" ? "Captured" : "Loading..."}
                  </div>
                )}
                <figcaption>
                  <strong>{index + 1}</strong>
                  <span>{displayTitle(observation)}</span>
                  <em>{new Date(observation.timestamp).toLocaleTimeString()}</em>
                </figcaption>
              </figure>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function useLocalObservationImages(
  sessionId: string | null,
  observations: Observation[],
): Map<string, LocalObservationImages> {
  const [images, setImages] = useState<Map<string, LocalObservationImages>>(() => new Map());
  const imageKey = observations.map((observation) => observation.id).join("|");

  useEffect(() => {
    let canceled = false;
    if (!sessionId || observations.length === 0) {
      setImages(new Map());
      return;
    }

    loadObservationImages(
      sessionId,
      observations.map((observation) => observation.id),
    )
      .then((nextImages) => {
        if (!canceled) setImages(nextImages);
      })
      .catch((err) => {
        console.warn("Failed to load local observation images", err);
        if (!canceled) setImages(new Map());
      });

    return () => {
      canceled = true;
    };
  }, [sessionId, imageKey, observations]);

  return images;
}

function thumbnailUrlForObservation(
  observation: TimelineObservation,
  localImages: Map<string, LocalObservationImages>,
): string {
  const local = localImages.get(observation.id);
  return (
    local?.cursorCropDataUrl ??
    observation.cursorCropDataUrl ??
    observation.cursorCropUrl ??
    local?.fullScreenshotDataUrl ??
    observation.fullScreenshotDataUrl ??
    observation.fullScreenshotUrl ??
    ""
  );
}

function trayImageUrlForObservation(
  observation: TimelineObservation,
  localImages: Map<string, LocalObservationImages>,
): string {
  const local = localImages.get(observation.id);
  return (
    local?.fullScreenshotDataUrl ??
    observation.fullScreenshotDataUrl ??
    local?.cursorCropDataUrl ??
    observation.cursorCropDataUrl ??
    observation.fullScreenshotUrl ??
    observation.cursorCropUrl ??
    ""
  );
}

function displayTitle(observation: TimelineObservation): string {
  const title = observation.windowTitle.trim();
  if (isFocusShellObservation(observation)) return "Focus";
  return title || observation.app || "Observed moment";
}

function displayApp(observation: TimelineObservation): string {
  if (isFocusShellObservation(observation)) return "";
  const app = observation.app.trim();
  const title = observation.windowTitle.trim();
  return app && app.toLowerCase() !== title.toLowerCase() ? app : "";
}

function isFocusShellObservation(observation: TimelineObservation): boolean {
  const app = observation.app.trim().toLowerCase();
  const title = observation.windowTitle.trim().toLowerCase();
  return app === "electron" && (title === "focus" || title.includes("attention-observing agent"));
}
