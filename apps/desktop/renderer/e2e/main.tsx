import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  DEFAULT_MONITORING_CONFIG,
  type ChatMessage,
  type Observation,
  type Report,
  type SavedWorkflow,
  type Session,
  type Workflow,
} from "@focus/shared";
import "../src/styles.css";
import { Chat } from "../src/components/Chat";
import { Timeline } from "../src/components/Timeline";
import { ReportView } from "../src/components/ReportView";
import { SessionWorkflows } from "../src/components/SessionWorkflows";
import { AutomationInbox } from "../src/components/AutomationInbox";
import { MonitoringController, type LiveTimelineBatch } from "../src/monitoring";
import { Button } from "../src/components/ui/button";
import { callables, savedWorkflows } from "./mocks/localApi";
import { emitDwell, getBridge } from "./mocks/platform";

const workflow: Workflow = {
  name: "Compare links",
  description: "You compare article links before summarizing them.",
  stepsObserved: ["Open source", "Copy link", "Compare against notes"],
  frequency: "twice",
  automatable: true,
  automationIdea: "Build a CLI that accepts URLs and writes a comparison table.",
  evidenceObsIds: ["obs-e2e"],
};

function createSession(status: Session["status"]): Session {
  return {
    id: "session-e2e",
    ownerUid: "uid-e2e",
    status,
    isDemo: false,
    title: "E2E session",
    startedAt: Date.now(),
    currentIntent: status === "active" ? "You are testing Focus." : "You tested Focus.",
    confidence: 0.84,
    activeApps: ["Chrome"],
    discoveredWorkflows: [workflow],
    agentFiles: { "/hypothesis.md": "You are testing Focus." },
    usage: {
      inputTokens: 10,
      outputTokens: 8,
      thinkingTokens: 2,
      totalTokens: 20,
      callCount: 1,
      byKind: {
        observation: {
          inputTokens: 10,
          outputTokens: 8,
          thinkingTokens: 2,
          totalTokens: 20,
          callCount: 1,
        },
        chat: { inputTokens: 0, outputTokens: 0, thinkingTokens: 0, totalTokens: 0, callCount: 0 },
        report: {
          inputTokens: 0,
          outputTokens: 0,
          thinkingTokens: 0,
          totalTokens: 0,
          callCount: 0,
        },
      },
    },
    lastUpdateAt: Date.now(),
    updateInFlight: false,
  };
}

function createObservation(): Observation {
  return {
    id: "obs-e2e",
    sessionId: "session-e2e",
    batchId: "batch-e2e",
    timestamp: Date.now(),
    app: "Chrome",
    windowTitle: "Focus test harness",
    mouse: { x: 20, y: 30 },
    dwellMs: 300,
    novelty: "high",
    frameHash: "hash",
    cursorCropDataUrl: "data:image/gif;base64,R0lGODlhAQABAAAAACw=",
    summary: "You captured a mocked browser moment.",
    inferredIntent: "You are testing Focus.",
    confidence: 0.84,
    evidence: ["You captured a dwell event."],
    alternatives: [],
    suggestedNextAction: "Review the generated report.",
  };
}

function createReport(): Report {
  return {
    id: "report-e2e",
    sessionId: "session-e2e",
    createdAt: Date.now(),
    objective: "You tested Focus end to end.",
    focusAreas: ["Mocked capture flow"],
    timelineMarkdown: "- 9:00 AM | obs-e2e | You captured a mocked browser moment.",
    significantScreenshots: [{ obsId: "obs-e2e", caption: "Captured harness image" }],
    interpretations: "You verified the mocked monitoring loop.",
    workflows: [workflow],
    nextSteps: ["Run CI."],
    narrative: "Field Report\n\nYou ran the deterministic Focus harness.",
  };
}

function savedWorkflowItems(): SavedWorkflow[] {
  return savedWorkflows.map((item, index) => ({
    id: `${"a".repeat(31)}${index}`,
    workflow: item.workflow,
    prompt: item.prompt,
    sourceSessionId: item.sourceSessionId,
    sourceReportId: item.sourceReportId,
    sourceTitle: item.sourceTitle,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }));
}

function Harness() {
  const [session, setSession] = useState<Session | null>(null);
  const [observations, setObservations] = useState<Observation[]>([]);
  const [liveBatches, setLiveBatches] = useState<LiveTimelineBatch[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [chatMessages] = useState<ChatMessage[]>([]);
  const [page, setPage] = useState<"monitor" | "report" | "inbox">("monitor");
  const [savedItems, setSavedItems] = useState<SavedWorkflow[]>([]);
  const controllerRef = useRef<MonitoringController | null>(null);

  useEffect(() => {
    const updateSaved = () => setSavedItems(savedWorkflowItems());
    window.addEventListener("focus-e2e-saved-workflows", updateSaved);
    updateSaved();
    return () => window.removeEventListener("focus-e2e-saved-workflows", updateSaved);
  }, []);

  async function start() {
    await callables.startSession({});
    const controller = new MonitoringController(
      "session-e2e",
      { ...DEFAULT_MONITORING_CONFIG, minUpdateIntervalMs: 1, maxBatch: 1 },
      undefined,
      undefined,
      setLiveBatches,
    );
    controllerRef.current = controller;
    controller.start();
    getBridge().onDwell((dwell) => controller.push(dwell));
    await getBridge().startCapture();
    setReport(null);
    setObservations([]);
    setSession(createSession("active"));
    setPage("monitor");
  }

  async function stop() {
    await getBridge().stopCapture();
    await controllerRef.current?.stop();
    await callables.stopSession({ sessionId: "session-e2e" });
    await callables.generateReport({ sessionId: "session-e2e" });
    setSession(createSession("stopped"));
    setObservations([createObservation()]);
    setLiveBatches([]);
    setReport(createReport());
  }

  const content = useMemo(() => {
    if (page === "inbox") {
      return <AutomationInbox items={savedItems} onBack={() => setPage("monitor")} />;
    }
    if (page === "report" && report) {
      return <ReportView observations={observations} report={report} />;
    }
    return (
      <>
        {session && (
          <Timeline
            sessionId={session.id}
            observations={observations}
            liveBatches={liveBatches}
            usage={session.usage}
          />
        )}
        {session && (
          <SessionWorkflows
            session={session}
            report={report}
            savedCount={savedItems.length}
            onOpenInbox={() => setPage("inbox")}
          />
        )}
      </>
    );
  }, [liveBatches, observations, page, report, savedItems, session]);

  return (
    <div className="app" style={{ padding: 24 }}>
      <div className="launcher-bar lb-header">
        <Button onClick={start}>Start monitoring</Button>
        <Button onClick={emitDwell} disabled={!session || session.status !== "active"}>
          Emit dwell
        </Button>
        <Button onClick={stop} disabled={!session || session.status !== "active"}>
          Stop
        </Button>
        <Button onClick={() => setPage("report")} disabled={!report}>
          View Report
        </Button>
        <Button onClick={() => setPage("inbox")}>Workflow Inbox {savedItems.length}</Button>
      </div>
      <main className="layout">
        <section className="col-main">{content}</section>
      </main>
      {session && (
        <div className="chat-dock" style={{ position: "relative" }}>
          <Chat
            sessionId={session.id}
            messages={chatMessages}
            enabled={session.status !== "active"}
          />
        </div>
      )}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Harness />
  </React.StrictMode>,
);
