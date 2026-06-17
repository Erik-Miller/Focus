import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { directAddressText, type Observation, type UsageAggregate } from "@focus/shared";
import { Card } from "@/components/ui/card";
import {
  loadObservationImages,
  type LocalObservationImages,
} from "../localObservationImages";
import { UsageBar } from "./UsageBar";

export function Timeline({
  sessionId,
  observations,
  usage,
}: {
  sessionId?: string | null;
  observations: Observation[];
  usage?: UsageAggregate;
}) {
  const [selectedEntry, setSelectedEntry] = useState<TimelineEntry | null>(null);
  const entries = buildTimelineEntries(observations);
  const timelineRef = useRef<HTMLUListElement>(null);
  const timelineMetricsRef = useRef<TimelineScrollMetrics | null>(null);
  const localImages = useLocalObservationImages(sessionId ?? null, observations);
  const timelineLayoutKey = entries.map((entry) => `${entry.id}:${entry.count}`).join("|");
  const lastEntryId = entries[entries.length - 1]?.id ?? null;

  useEffect(() => {
    if (!selectedEntry) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setSelectedEntry(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedEntry]);

  useLayoutEffect(() => {
    const node = timelineRef.current;
    if (!node) return;

    const previous = timelineMetricsRef.current;
    const nextScrollWidth = node.scrollWidth;
    const nextMaxScrollLeft = maxScrollLeft(node);
    const sessionChanged = previous?.sessionId !== sessionId;

    if (!previous || sessionChanged) {
      node.scrollLeft = nextMaxScrollLeft;
    } else {
      const previousMaxScrollLeft = Math.max(0, previous.scrollWidth - previous.clientWidth);
      const wasNearNewest = previousMaxScrollLeft - node.scrollLeft <= 32;
      if (wasNearNewest && nextScrollWidth >= previous.scrollWidth) {
        node.scrollLeft = nextMaxScrollLeft;
      }
    }

    timelineMetricsRef.current = {
      sessionId,
      lastEntryId,
      scrollWidth: node.scrollWidth,
      clientWidth: node.clientWidth,
    };
  }, [lastEntryId, sessionId, timelineLayoutKey]);

  if (observations.length === 0) {
    return (
      <Card className="timeline-card gap-0 overflow-hidden py-0">
        <TimelineHeader count={0} usage={usage} />
        <p className="empty">No observed moments yet.</p>
      </Card>
    );
  }
  return (
    <Card className="timeline-card gap-0 overflow-hidden py-0">
      <TimelineHeader count={observations.length} usage={usage} />
      <ul className="timeline" ref={timelineRef}>
        {entries.map((entry) => {
          const o = entry.latest;
          const pending = entry.pending;
          const thumbUrl = thumbnailUrlForObservation(o, localImages);
          return (
            <li
              key={entry.id}
              className={`tl-item${pending ? " tl-item-pending" : ""}${
                entry.count > 1 ? " tl-item-batch" : ""
              }`}
            >
              <button
                type="button"
                className="tl-thumb"
                onClick={() => setSelectedEntry(entry)}
                aria-label={`Show ${entry.count} analyzed image${entry.count === 1 ? "" : "s"}`}
              >
                {thumbUrl ? (
                  <img src={thumbUrl} alt={o.app} loading="lazy" />
                ) : (
                  <div className="tl-thumb-empty" />
                )}
                {entry.count > 1 && <span className="tl-thumb-count">{entry.count}</span>}
              </button>
              <div className="tl-body">
                <div className="tl-title">{entry.title}</div>
                <div className="tl-meta">
                  {entry.context && <span>{entry.context}</span>}
                  <span>{entry.timeLabel}</span>
                </div>
                {entry.summary ? (
                  <div key="summary" className="tl-summary">
                    {directAddressText(entry.summary)}
                  </div>
                ) : (
                  <div key="pending" className="tl-summary tl-summary-pending">
                    Analyzing...
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

interface TimelineEntry {
  id: string;
  latest: Observation;
  observations: Observation[];
  count: number;
  pending: boolean;
  title: string;
  context: string;
  timeLabel: string;
  summary: string;
}

interface TimelineScrollMetrics {
  sessionId?: string | null;
  lastEntryId: string | null;
  scrollWidth: number;
  clientWidth: number;
}

function maxScrollLeft(node: HTMLElement): number {
  return Math.max(0, node.scrollWidth - node.clientWidth);
}

function buildTimelineEntries(observations: Observation[]): TimelineEntry[] {
  const groups = new Map<string, Observation[]>();
  for (const observation of observations) {
    const key = shouldGroupBatch(observation)
      ? `batch:${observation.batchId}`
      : `observation:${observation.id}`;
    const group = groups.get(key);
    if (group) group.push(observation);
    else groups.set(key, [observation]);
  }

  return Array.from(groups.entries())
    .map(([id, group]) => entryFromGroup(id, group))
    .sort((a, b) => a.latest.timestamp - b.latest.timestamp);
}

function shouldGroupBatch(observation: Observation): boolean {
  return Boolean(observation.batchId && observation.batchId !== "demo");
}

function entryFromGroup(id: string, observations: Observation[]): TimelineEntry {
  const ordered = [...observations].sort((a, b) => a.timestamp - b.timestamp);
  const latest = ordered[ordered.length - 1];
  const pending = ordered.some((o) => !o.summary);
  const count = ordered.length;
  return {
    id,
    latest,
    observations: ordered,
    count,
    pending,
    title: titleForEntry(ordered, pending),
    context: contextForEntry(ordered),
    timeLabel: timeLabelForEntry(ordered),
    summary: pending ? "" : latest.summary,
  };
}

function titleForEntry(observations: Observation[], pending: boolean): string {
  if (observations.length === 1) return displayTitle(observations[0]);
  return pending ? "Analyzing activity" : "Activity";
}

function contextForEntry(observations: Observation[]): string {
  const labels = unique(
    observations
      .map((o) => displayApp(o) || displayTitle(o))
      .filter((label) => label.trim().length > 0),
  );
  if (labels.length <= 2) return labels.join(", ");
  return `${labels.slice(0, 2).join(", ")} +${labels.length - 2}`;
}

function timeLabelForEntry(observations: Observation[]): string {
  const first = observations[0];
  const last = observations[observations.length - 1];
  const start = new Date(first.timestamp).toLocaleTimeString();
  const end = new Date(last.timestamp).toLocaleTimeString();
  return start === end ? start : `${start} - ${end}`;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
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
  const title = "Images being analyzed";

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
                  <div className="image-tile-empty">Uploading...</div>
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
  observation: Observation,
  localImages: Map<string, LocalObservationImages>,
): string {
  const local = localImages.get(observation.id);
  return (
    local?.cursorCropDataUrl ??
    observation.cursorCropUrl ??
    local?.fullScreenshotDataUrl ??
    observation.fullScreenshotUrl ??
    ""
  );
}

function trayImageUrlForObservation(
  observation: Observation,
  localImages: Map<string, LocalObservationImages>,
): string {
  const local = localImages.get(observation.id);
  return (
    local?.fullScreenshotDataUrl ??
    local?.cursorCropDataUrl ??
    observation.fullScreenshotUrl ??
    observation.cursorCropUrl ??
    ""
  );
}

function displayTitle(observation: Observation): string {
  const title = observation.windowTitle.trim();
  if (isFocusShellObservation(observation)) return "Focus";
  return title || observation.app || "Observed moment";
}

function displayApp(observation: Observation): string {
  if (isFocusShellObservation(observation)) return "";
  const app = observation.app.trim();
  const title = observation.windowTitle.trim();
  return app && app.toLowerCase() !== title.toLowerCase() ? app : "";
}

function isFocusShellObservation(observation: Observation): boolean {
  const app = observation.app.trim().toLowerCase();
  const title = observation.windowTitle.trim().toLowerCase();
  return app === "electron" && (title === "focus" || title.includes("attention-observing agent"));
}
