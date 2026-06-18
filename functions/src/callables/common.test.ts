import { describe, expect, it, vi } from "vitest";
import { HttpsError } from "firebase-functions/v2/https";
import {
  agentErrorMessage,
  cleanTimeZone,
  emptyUsageAggregate,
  fileContent,
  formatTimestampForTimeZone,
  isGeminiQuotaError,
  OBSERVATION_INGEST_CALLABLE_OPTS,
  observationsDigest,
  recordUsage,
  requireAuth,
  SESSION_CALLABLE_OPTS,
  storagePathFromDownloadUrl,
  toAgentHttpsError,
} from "./common.js";
import type { Observation, TokenUsage } from "@focus/shared";

describe("callable common helpers", () => {
  it("requires callable auth", () => {
    expect(requireAuth({ auth: { uid: "uid1" } } as never)).toBe("uid1");
    expect(() => requireAuth({} as never)).toThrow(HttpsError);
  });

  it("maps quota errors to resource-exhausted and generic errors to internal", () => {
    const quota = new Error("429 RESOURCE_EXHAUSTED quota exceeded");
    expect(isGeminiQuotaError(quota)).toBe(true);
    expect(toAgentHttpsError(quota).code).toBe("resource-exhausted");
    expect(agentErrorMessage(quota)).toContain("Gemini quota is exhausted");

    const generic = new Error("boom");
    expect(isGeminiQuotaError(generic)).toBe(false);
    expect(toAgentHttpsError(generic).code).toBe("internal");
    expect(agentErrorMessage(generic)).toBe("boom");
  });

  it("formats observation digests with optional timezone labels", () => {
    const observations: Observation[] = [
      {
        id: "obs1",
        sessionId: "session1",
        batchId: "batch1",
        timestamp: Date.UTC(2026, 0, 2, 15, 4),
        app: "Chrome",
        windowTitle: "News",
        mouse: { x: 1, y: 2 },
        dwellMs: 300,
        novelty: "high",
        frameHash: "hash",
        summary: "You compared headlines.",
        inferredIntent: "You compared coverage.",
        confidence: 0.7,
        evidence: [],
        alternatives: [],
        suggestedNextAction: "",
      },
    ];

    expect(observationsDigest(observations)).toContain("2026-01-02T15:04:00.000Z");
    expect(observationsDigest(observations, "America/Chicago")).toContain("(America/Chicago)");
    expect(observationsDigest([{ ...observations[0], summary: "", inferredIntent: "" }])).toContain(
      "Unanalyzed high dwell (300ms, no screenshot).",
    );
  });

  it("cleans timezone input and reads agent file content safely", () => {
    expect(cleanTimeZone(" America/Chicago ")).toBe("America/Chicago");
    expect(cleanTimeZone("Nope/Bad")).toBeUndefined();
    expect(formatTimestampForTimeZone(Date.UTC(2026, 0, 2, 15, 4), "America/Chicago")).toBe(
      "Jan 2, 9:04 AM",
    );
    expect(fileContent({ "/hypothesis.md": "hello" }, "/hypothesis.md")).toBe("hello");
    expect(fileContent({}, "/missing.md")).toBe("");
  });

  it("extracts storage paths from Firebase download references", () => {
    expect(
      storagePathFromDownloadUrl(
        "https://firebasestorage.googleapis.com/v0/b/focus-test.appspot.com/o/screenshots%2Fsession1%2Fobs1-crop?alt=media&token=abc",
      ),
    ).toBe("screenshots/session1/obs1-crop");
    expect(
      storagePathFromDownloadUrl("gs://focus-test.appspot.com/screenshots/session1/obs1-crop"),
    ).toBe("screenshots/session1/obs1-crop");
    expect(storagePathFromDownloadUrl("screenshots/session1/obs1-crop")).toBe(
      "screenshots/session1/obs1-crop",
    );
    expect(storagePathFromDownloadUrl("https://example.com/nope")).toBeNull();
  });

  it("builds the empty usage aggregate shape", () => {
    expect(emptyUsageAggregate()).toMatchObject({
      inputTokens: 0,
      callCount: 0,
      byKind: {
        observation: { callCount: 0 },
        chat: { callCount: 0 },
        report: { callCount: 0 },
      },
    });
  });

  it("keeps session bookkeeping callables lightweight", () => {
    expect(SESSION_CALLABLE_OPTS).toMatchObject({
      memory: "256MiB",
      timeoutSeconds: 30,
      region: "us-central1",
    });
    expect(SESSION_CALLABLE_OPTS).not.toHaveProperty("secrets");
    expect(OBSERVATION_INGEST_CALLABLE_OPTS).toMatchObject({
      memory: "512MiB",
      timeoutSeconds: 120,
      region: "us-central1",
    });
    expect(OBSERVATION_INGEST_CALLABLE_OPTS).not.toHaveProperty("secrets");
  });

  it("persists usage event and session aggregate increments", async () => {
    const eventSet = vi.fn();
    const update = vi.fn();
    const sessionRef = {
      collection: vi.fn(() => ({
        doc: () => ({ id: "usage1", set: eventSet }),
      })),
      update,
    };
    const usage: TokenUsage = {
      inputTokens: 10,
      outputTokens: 5,
      thinkingTokens: 2,
      totalTokens: 17,
    };

    await recordUsage(sessionRef as never, "chat", usage, 123);

    expect(eventSet).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "usage1",
        kind: "chat",
        model: "gemini-3.5-flash",
        thinkingLevel: "medium",
        latencyMs: 123,
      }),
    );
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        "usage.inputTokens": expect.anything(),
        "usage.byKind.chat.callCount": expect.anything(),
      }),
    );
  });
});
