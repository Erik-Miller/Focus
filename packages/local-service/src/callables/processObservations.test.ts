import { describe, expect, it } from "vitest";
import type { DwellInput } from "@focus/shared";
import {
  activityForObservations,
  cleanClientObservationId,
  observationId,
  reasoningActivity,
} from "./processObservations.js";

const dwell: DwellInput = {
  timestamp: 123,
  app: "Chrome",
  windowTitle: "News",
  mouse: { x: 10, y: 20 },
  dwellMs: 300,
  novelty: "high",
  frameHash: "hash",
  cursorCropDataUrl: "data:image/png;base64,abc",
};

describe("processObservations helpers", () => {
  it("uses clean client observation ids and rejects unsafe ids", () => {
    expect(cleanClientObservationId(" obs_12345678 ")).toBe("obs_12345678");
    expect(cleanClientObservationId("short")).toBeNull();
    expect(cleanClientObservationId("../bad-id")).toBeNull();
    expect(observationId("session1", { ...dwell, clientObservationId: "obs_12345678" })).toBe(
      "obs_12345678",
    );
  });

  it("generates stable hashed ids from dwell content", () => {
    const first = observationId("session1", dwell);
    expect(first).toHaveLength(32);
    expect(observationId("session1", dwell)).toBe(first);
    expect(observationId("session1", { ...dwell, mouse: { x: 11, y: 20 } })).not.toBe(first);
  });

  it("formats capture and reasoning activity labels", () => {
    expect(activityForObservations([dwell])).toBe("Captured new activity in Chrome.");
    expect(activityForObservations([dwell, { ...dwell, app: "Code" }])).toBe(
      "Captured 2 new moments.",
    );
    expect(reasoningActivity(1)).toBe("Agent is analyzing 1 new moment.");
    expect(reasoningActivity(2)).toBe("Agent is analyzing 2 new moments.");
  });
});
