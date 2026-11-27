import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initializeLocalStore, db, bucket, FieldValue, storeEvents } from "./localStore.js";
import { localCall, localQuery } from "./desktopService.js";
import { loadAgentModelConfig } from "./callables/common.js";

const agentMocks = vi.hoisted(() => ({ monitoring: vi.fn(), chat: vi.fn(), report: vi.fn() }));
vi.mock("./agent/runAgent.js", () => ({
  runMonitoring: agentMocks.monitoring,
  runChat: agentMocks.chat,
  runReport: agentMocks.report,
}));

let directory: string;
beforeEach(async () => {
  directory = mkdtempSync(path.join(os.tmpdir(), "focus-local-test-"));
  await initializeLocalStore(directory);
});
afterEach(() => {
  storeEvents.removeAllListeners();
  rmSync(directory, { recursive: true, force: true });
});
describe("local SQLite service", () => {
  it("persists sessions and observations across restart without network access", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network forbidden"));
    const { sessionId } = (await localCall("startSession", { title: "Offline work" })) as {
      sessionId: string;
    };
    await localCall("ingestObservations", {
      sessionId,
      observations: [
        {
          timestamp: 1,
          app: "Editor",
          windowTitle: "Notes",
          dwellMs: 300,
          novelty: "high",
          frameHash: "abc",
          cursorCropDataUrl: "data:image/png;base64,aGVsbG8=",
        },
      ],
    });
    await localCall("stopSession", { sessionId });
    expect(readFileSync(path.join(directory, "focus.sqlite")).subarray(0, 15).toString()).toBe(
      "SQLite format 3",
    );
    await initializeLocalStore(directory);
    expect(await localQuery({ kind: "session", sessionId })).toMatchObject({
      title: "Offline work",
      status: "stopped",
    });
    expect(await localQuery({ kind: "observations", sessionId })).toHaveLength(1);
    expect(fetch).not.toHaveBeenCalled();
    fetch.mockRestore();
  });
  it("serializes concurrent increments and rolls back failed transactions", async () => {
    const ref = db.collection("sessions").doc("test");
    await ref.set({ usage: { count: 0 } });
    await Promise.all(
      Array.from({ length: 10 }, () =>
        db.runTransaction(async (tx) => {
          const snapshot = await tx.get(ref);
          tx.update(ref, { "usage.count": snapshot.get("usage").count + 1 });
        }),
      ),
    );
    expect((await ref.get()).get("usage").count).toBe(10);
    await expect(
      db.runTransaction(async (tx) => {
        tx.update(ref, { "usage.count": 100 });
        throw new Error("abort");
      }),
    ).rejects.toThrow("abort");
    await ref.update({ "usage.count": FieldValue.increment(2), removeMe: 1 });
    await ref.update({ removeMe: FieldValue.delete() });
    expect((await ref.get()).data()).toEqual({ usage: { count: 12 } });
    await initializeLocalStore(directory);
    expect((await ref.get()).get("usage").count).toBe(12);
  });
  it("deletes a session and its screenshots while preserving other sessions", async () => {
    const first = (await localCall("startSession", {})) as { sessionId: string };
    const second = (await localCall("startSession", {})) as { sessionId: string };
    const file = bucket.file(`screenshots/${first.sessionId}/test`);
    await file.save(Buffer.from("image"));
    await db
      .collection("sessions")
      .doc(first.sessionId)
      .collection("chat")
      .doc("message")
      .set({ content: "hello" });
    await localCall("deleteSession", first);
    expect(await localQuery({ kind: "session", ...first })).toBeNull();
    expect(await localQuery({ kind: "chat", ...first })).toEqual([]);
    await expect(file.download()).rejects.toThrow();
    expect(await localQuery({ kind: "session", ...second })).not.toBeNull();
  });
  it("rejects arbitrary operations and unsafe screenshot paths", async () => {
    await expect(localCall("constructor", {})).rejects.toThrow("Unknown");
    expect(() => bucket.file("../../secret")).toThrow("Invalid");
    await expect(localQuery({ kind: "session", sessionId: "../secret" })).rejects.toThrow(
      "Invalid",
    );
  });
  it("routes OpenAI explicitly and never falls back to another provider's key", async () => {
    const key = "sk-test-openai-1234567890";
    await expect(
      loadAgentModelConfig({ agentModel: "gpt-5.4-mini", openaiApiKey: key }),
    ).resolves.toEqual({ provider: "openai", model: "gpt-5.4-mini", apiKey: key });
    await expect(
      loadAgentModelConfig({ agentModel: "gpt-5.4-mini", anthropicApiKey: key }),
    ).rejects.toThrow("OpenAI API key");
    await expect(loadAgentModelConfig({ agentModel: "gemini-3.6-flash" })).rejects.toThrow(
      "Gemini API key",
    );
    expect(process.env.LANGSMITH_TRACING).toBe("false");
  });
});

it("runs monitoring, chat, reports, and saved workflows against the real local database", async () => {
  const usage = { inputTokens: 10, outputTokens: 5, thinkingTokens: 0, totalTokens: 15 };
  const workflow = {
    name: "Summarize notes",
    description: "You summarize notes",
    stepsObserved: ["Read", "Summarize"],
    frequency: "twice",
    automatable: true,
    automationIdea: "Create a summary script",
    evidenceObsIds: [],
  };
  agentMocks.monitoring.mockResolvedValue({
    usage,
    update: {
      currentIntent: "You are writing notes",
      confidence: 0.9,
      batchSummary: "You wrote notes",
      evidence: [],
      alternatives: [],
      suggestedNextAction: "Review",
      activeApps: ["Editor"],
      discoveredWorkflows: [workflow],
      hypothesisMarkdown: "Notes",
      workflowsMarkdown: "Summarize",
    },
  });
  agentMocks.chat.mockResolvedValue({ usage, answer: "You wrote notes." });
  agentMocks.report.mockResolvedValue({
    usage,
    report: {
      objective: "Write notes",
      focusAreas: ["Notes"],
      timelineMarkdown: "Today",
      significantScreenshots: [],
      interpretations: "You wrote notes",
      workflows: [workflow],
      nextSteps: ["Review"],
      narrative: "You wrote notes.",
    },
  });
  const { sessionId } = (await localCall("startSession", {})) as { sessionId: string };
  const credentials = { agentModel: "gpt-5.4-mini", openaiApiKey: "sk-test-openai-1234567890" };
  await localCall("ingestObservations", {
    sessionId,
    observations: [
      {
        timestamp: 1,
        app: "Editor",
        windowTitle: "Notes",
        dwellMs: 300,
        novelty: "high",
        frameHash: "abc",
      },
    ],
  });
  await expect(
    localCall("synthesizePendingObservations", { sessionId, reason: "stop", ...credentials }),
  ).resolves.toMatchObject({ interpreted: true });
  await expect(
    localCall("chatWithAgent", {
      sessionId,
      runId: "chat_test_1234",
      message: "What did I do?",
      ...credentials,
    }),
  ).resolves.toEqual({ answer: "You wrote notes." });
  await localCall("stopSession", { sessionId });
  const { reportId } = (await localCall("generateReport", { sessionId, ...credentials })) as {
    reportId: string;
  };
  const { id } = (await localCall("saveWorkflowForLater", {
    workflow,
    sourceSessionId: sessionId,
    sourceTitle: "Notes",
    prompt: "Build the script",
  })) as { id: string };
  await localCall("recordSavedWorkflowLaunch", { id, target: "desktop" });
  await initializeLocalStore(directory);
  expect(await localQuery({ kind: "session", sessionId })).toMatchObject({
    status: "stopped",
    usage: { callCount: 3, totalTokens: 45 },
  });
  expect(await localQuery({ kind: "chat", sessionId })).toHaveLength(2);
  expect(await localQuery({ kind: "report", sessionId, reportId })).toMatchObject({
    narrative: "You wrote notes.",
  });
  expect(await localQuery({ kind: "savedWorkflows" })).toEqual([
    expect.objectContaining({ id, lastLaunchTarget: "desktop" }),
  ]);
  expect(
    readFileSync(path.join(directory, "focus.sqlite")).includes(
      Buffer.from(credentials.openaiApiKey),
    ),
  ).toBe(false);
  await localCall("deleteSavedWorkflow", { id });
  expect(await localQuery({ kind: "savedWorkflows" })).toEqual([]);
});
