import { describe, expect, it } from "vitest";
import { LocalError } from "../localCall.js";
import {
  MAX_CHAT_OBSERVATION_IMAGES,
  chatObservationImagePath,
  cleanRunId,
} from "./chatWithAgent.js";
import type { Observation } from "@focus/shared";

describe("chatWithAgent helpers", () => {
  it("accepts safe run ids and trims whitespace", () => {
    expect(cleanRunId(" run_12345678 ")).toBe("run_12345678");
    expect(cleanRunId("A".repeat(128))).toBe("A".repeat(128));
  });

  it("rejects short, oversized, or unsafe run ids", () => {
    expect(() => cleanRunId("short")).toThrow(LocalError);
    expect(() => cleanRunId("A".repeat(129))).toThrow(LocalError);
    expect(() => cleanRunId("../bad-run-id")).toThrow(LocalError);
  });

  it("prefers a full screenshot and falls back to a cursor crop", () => {
    expect(
      chatObservationImagePath({
        fullScreenshotPath: "screenshots/session1/full.jpg",
        cursorCropPath: "screenshots/session1/crop.jpg",
      } as Observation),
    ).toBe("screenshots/session1/full.jpg");
    expect(
      chatObservationImagePath({ cursorCropPath: "screenshots/session1/crop.jpg" } as Observation),
    ).toBe("screenshots/session1/crop.jpg");
    expect(chatObservationImagePath({} as Observation)).toBeNull();
  });

  it("bounds multimodal chat context", () => {
    expect(MAX_CHAT_OBSERVATION_IMAGES).toBe(4);
  });
});
