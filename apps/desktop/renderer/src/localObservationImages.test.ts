import { beforeEach, describe, expect, it } from "vitest";
import {
  createClientObservationId,
  loadObservationImages,
  resetLocalObservationImagesForTest,
  saveObservationImages,
} from "./localObservationImages.js";
import type { DwellInput } from "@focus/shared";

const DB_NAME = "focus-local-observation-images";

function deleteDb(): Promise<void> {
  resetLocalObservationImagesForTest();
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
}

function dwell(id: string): DwellInput {
  return {
    clientObservationId: id,
    timestamp: Date.now(),
    app: "Chrome",
    windowTitle: "News",
    mouse: { x: 1, y: 2 },
    dwellMs: 300,
    novelty: "high",
    frameHash: "hash",
    cursorCropDataUrl: "data:image/jpeg;base64,crop",
    fullScreenshotDataUrl: "data:image/jpeg;base64,full",
  };
}

describe("local observation image cache", () => {
  beforeEach(async () => {
    await deleteDb();
  });

  it("creates durable client observation ids", () => {
    expect(createClientObservationId()).toMatch(/^obs_/);
  });

  it("saves and loads image data by session and observation id", async () => {
    await saveObservationImages("session1", dwell("obs1"));

    const images = await loadObservationImages("session1", ["obs1", "missing"]);

    expect(images.get("obs1")).toEqual({
      cursorCropDataUrl: "data:image/jpeg;base64,crop",
      fullScreenshotDataUrl: "data:image/jpeg;base64,full",
    });
    expect(images.has("missing")).toBe(false);
  });

  it("does nothing for missing session, ids, client ids, or image data", async () => {
    await saveObservationImages("session1", { ...dwell("obs1"), clientObservationId: undefined });
    await saveObservationImages("session1", {
      ...dwell("obs2"),
      cursorCropDataUrl: undefined,
      fullScreenshotDataUrl: undefined,
    });

    expect(await loadObservationImages(null, ["obs1"])).toEqual(new Map());
    expect(await loadObservationImages("session1", [])).toEqual(new Map());
    expect(await loadObservationImages("session1", ["obs1", "obs2"])).toEqual(new Map());
  });
});
