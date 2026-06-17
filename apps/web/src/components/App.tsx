import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { ArrowLeft, Inbox as InboxIcon } from "lucide-react";
import { ensureSignedIn, callables } from "../firebase";
import { getBridge, isDesktop, type CaptureState } from "../platform";
import { MonitoringController, type MonitoringStatus } from "../monitoring";
import type { Observation, Report, Session } from "@focus/shared";
import {
  useChat,
  useObservations,
  useReport,
  useSavedWorkflows,
  useSession,
  useSessions,
} from "../hooks";
import { Controls } from "./Controls";
import { AgentAwareness } from "./AgentAwareness";
import { Timeline } from "./Timeline";
import { Chat } from "./Chat";
import { ReportView } from "./ReportView";
import { SessionList } from "./SessionList";
import { AutomationInbox } from "./AutomationInbox";
import { Button } from "@/components/ui/button";

const SESSION_KEY = "focus.sessionId";
type AppPage = "monitor" | "report" | "inbox";
type LiveMonitoringPhase = "monitoring" | "capturing" | "analyzing" | "stopping";

export function App() {
  const [ready, setReady] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(() =>
    localStorage.getItem(SESSION_KEY),
  );
  const [busy, setBusy] = useState<string | null>(null);
  // Optimistic stop: flip the UI out of "monitoring" the instant the user hits
  // Stop, while the flush/stop/report run in the background.
  const [stopping, setStopping] = useState(false);
  // Keeps the expanded page mounted briefly while it fades out on collapse.
  const [collapsing, setCollapsing] = useState(false);
  // Start open in both the web build and the Electron shell.
  const [expanded, setExpanded] = useState(true);
  const [page, setPage] = useState<AppPage>("monitor");
  const [chatDockHeight, setChatDockHeight] = useState(0);
  const [captureState, setCaptureState] = useState<CaptureState>("idle");
  const [monitoringStatus, setMonitoringStatus] = useState<MonitoringStatus>({
    phase: "idle",
    bufferCount: 0,
  });
  const controllerRef = useRef<MonitoringController | null>(null);
  const dwellUnsubRef = useRef<(() => void) | null>(null);
  const captureStateUnsubRef = useRef<(() => void) | null>(null);
  const captureIdleTimerRef = useRef<number | null>(null);

  const desktop = isDesktop();
  const session = useSession(sessionId);
  const observations = useObservations(sessionId);
  const chat = useChat(sessionId);
  const report = useReport(sessionId, session?.reportId);
  const sessions = useSessions();
  const savedWorkflows = useSavedWorkflows();

  // Switch the viewed session (review past sessions + their reports).
  const selectSession = useCallback((id: string) => {
    setSessionId(id);
    setPage("monitor");
    setExpanded(true);
    setCollapsing(false);
  }, []);

  const reporting = session?.status === "reporting";

  useEffect(() => {
    ensureSignedIn().then(() => setReady(true));
  }, []);

  useEffect(() => {
    return () => {
      dwellUnsubRef.current?.();
      captureStateUnsubRef.current?.();
      if (captureIdleTimerRef.current) clearTimeout(captureIdleTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (sessionId) localStorage.setItem(SESSION_KEY, sessionId);
    else {
      localStorage.removeItem(SESSION_KEY);
      setPage((current) => (current === "report" ? "monitor" : current));
    }
  }, [sessionId]);

  // Once the session is no longer active, the optimistic stop has landed.
  useEffect(() => {
    if (session?.status !== "active") setStopping(false);
  }, [session?.status]);

  // Wire a controller + capture/dwell listeners to a (new or resumed) session id.
  const beginMonitoring = useCallback(async (id: string) => {
    const bridge = getBridge();
    if (!bridge) return;
    setPage("monitor");
    setMonitoringStatus({ phase: "idle", bufferCount: 0 });
    setCaptureState("idle");
    const controller = new MonitoringController(id, undefined, undefined, setMonitoringStatus);
    controllerRef.current = controller;
    controller.start();
    // Replace any prior dwell subscription so old (stopped) controllers don't
    // keep receiving events and firing duplicate processObservations calls.
    dwellUnsubRef.current?.();
    dwellUnsubRef.current = bridge.onDwell((dwell) => controller.push(dwell));
    captureStateUnsubRef.current?.();
    captureStateUnsubRef.current = bridge.onCaptureState((state) => {
      if (captureIdleTimerRef.current) clearTimeout(captureIdleTimerRef.current);
      if (state === "capturing") {
        setCaptureState("capturing");
        return;
      }
      captureIdleTimerRef.current = window.setTimeout(() => setCaptureState("idle"), 650);
    });
    await bridge.startCapture();
  }, []);

  const startFocus = useCallback(async () => {
    const bridge = getBridge();
    if (!bridge) return;
    // Stay compact: starting drops into a live monitoring state in the bar.
    setStopping(false);
    // Resume the current session if one exists; otherwise open a new session.
    const resumeId = sessionId;
    setBusy(resumeId ? "Resuming session…" : "Starting focus session…");
    try {
      let id = resumeId;
      if (id) {
        await callables.resumeSession({ sessionId: id });
      } else {
        const { data } = await callables.startSession({ title: "Focus session" });
        id = data.sessionId;
        setSessionId(id);
      }
      await beginMonitoring(id);
    } finally {
      setBusy(null);
    }
  }, [sessionId, beginMonitoring]);

  const stopFocus = useCallback(() => {
    const bridge = getBridge();
    const id = sessionId;
    // Flip the UI to stopped immediately; never block on the network.
    setStopping(true);
    // Detach capture + the dwell listener right away so nothing new buffers.
    dwellUnsubRef.current?.();
    dwellUnsubRef.current = null;
    captureStateUnsubRef.current?.();
    captureStateUnsubRef.current = null;
    if (captureIdleTimerRef.current) clearTimeout(captureIdleTimerRef.current);
    setCaptureState("idle");
    setMonitoringStatus({ phase: "idle", bufferCount: 0 });
    const controller = controllerRef.current;
    controllerRef.current = null;
    // Flush remaining dwells, mark the session stopped, and kick off the report
    // — all in the background. The UI reflects status via the session listener.
    void (async () => {
      try {
        if (bridge) await bridge.stopCapture();
        if (id) await callables.stopSession({ sessionId: id });
        if (controller) await controller.stop();
        if (id) await callables.generateReport({ sessionId: id, timeZone: userTimeZone() });
      } catch (err) {
        console.error("stop/flush/report failed", err);
      }
    })();
  }, [sessionId]);

  const loadDemo = useCallback(async () => {
    setBusy("Loading demo session…");
    try {
      const { data } = await callables.seedDemoSession({});
      setSessionId(data.sessionId);
    } finally {
      setBusy(null);
    }
  }, []);

  const newSession = useCallback(async () => {
    dwellUnsubRef.current?.();
    dwellUnsubRef.current = null;
    captureStateUnsubRef.current?.();
    captureStateUnsubRef.current = null;
    if (captureIdleTimerRef.current) clearTimeout(captureIdleTimerRef.current);
    setCaptureState("idle");
    setMonitoringStatus({ phase: "idle", bufferCount: 0 });
    setSessionId(null);
    setPage("monitor");
    const bridge = getBridge();
    if (bridge) {
      await bridge.setWindowMode("compact");
      setExpanded(false);
    }
  }, []);

  // "+ New" in the launcher: stop any current capture and clear the selected
  // session. Starting the next capture stays behind the explicit Start button.
  const startFreshSession = useCallback(async () => {
    const bridge = getBridge();
    const previousSessionId = sessionId;
    const shouldStopPreviousSession = session?.status === "active";
    dwellUnsubRef.current?.();
    dwellUnsubRef.current = null;
    captureStateUnsubRef.current?.();
    captureStateUnsubRef.current = null;
    if (captureIdleTimerRef.current) clearTimeout(captureIdleTimerRef.current);
    setCaptureState("idle");
    setMonitoringStatus({ phase: "idle", bufferCount: 0 });
    const prev = controllerRef.current;
    controllerRef.current = null;
    localStorage.removeItem(SESSION_KEY);
    setStopping(false);
    setSessionId(null);
    setPage("monitor");

    void (async () => {
      try {
        if (bridge) await bridge.stopCapture();
        if (prev) await prev.stop();
      } catch (err) {
        console.error("fresh-session cleanup failed", err);
      } finally {
        if (previousSessionId && shouldStopPreviousSession) {
          await callables
            .stopSession({ sessionId: previousSessionId })
            .catch((err) => console.error("fresh-session stop failed", err));
        }
      }
    })();
  }, [session?.status, sessionId]);

  const openDashboard = useCallback(() => {
    const bridge = getBridge();
    setCollapsing(false);
    // Mount the page immediately so it fades in as the window grows.
    if (bridge) void bridge.setWindowMode("full");
    setExpanded(true);
  }, []);

  const openInbox = useCallback(() => {
    const bridge = getBridge();
    setCollapsing(false);
    if (bridge) void bridge.setWindowMode("full");
    setPage("inbox");
    setExpanded(true);
  }, []);

  // Collapse back to the bar without ending the session (keeps monitoring live).
  // Shrink the window and fade the page out together, then unmount it.
  const collapseToBar = useCallback(() => {
    const bridge = getBridge();
    setCollapsing(true);
    if (bridge) void bridge.setWindowMode("compact");
    window.setTimeout(() => {
      setExpanded(false);
      setCollapsing(false);
    }, 240);
  }, []);

  // Fire-and-forget so report generation never blocks the UI. Progress is
  // reflected by the session's "reporting" status and the report listener.
  const generateReport = useCallback(() => {
    if (!sessionId) return;
    void callables
      .generateReport({ sessionId, timeZone: userTimeZone() })
      .catch((err) => console.error("report generation failed", err));
  }, [sessionId]);

  if (!ready) {
    return <div className="boot">Connecting to Focus…</div>;
  }

  const stopped = session?.status === "stopped" || session?.status === "reporting";
  const canChat = Boolean(session) && (stopped || Boolean(session?.isDemo));
  const canGenerateReport = Boolean(session) && (stopped || Boolean(session?.isDemo));
  const monitoringLabel = monitoringLabelFor({
    captureState,
    monitoringStatus,
    sessionUpdateInFlight: Boolean(session?.updateInFlight),
    stopping,
  });
  const liveMonitoringPhase = liveMonitoringPhaseFor({
    captureState,
    monitoringStatus,
    sessionUpdateInFlight: Boolean(session?.updateInFlight),
    stopping,
  });

  // Desktop: the compact launcher bar is the persistent header in both states.
  if (desktop) {
    const monitoring = session?.status === "active" && !stopping;
    const showInboxPage = page === "inbox";
    const showReportPage = Boolean(session && page === "report");
    const showChatDock = Boolean(session && page === "monitor");
    const showDesktopStatus = Boolean(!showInboxPage && (busy || session?.lastError));
    const launcher = (
      <Launcher
        busy={busy}
        monitoring={monitoring}
        label={monitoringLabel}
        phase={liveMonitoringPhase}
        expanded={expanded}
        onStart={startFocus}
        onStop={stopFocus}
        onNew={startFreshSession}
        onOpenInbox={openInbox}
        inboxActive={page === "inbox"}
        inboxCount={savedWorkflows.length}
        onToggleExpand={expanded ? collapseToBar : openDashboard}
      />
    );

    if (!expanded && !collapsing) return launcher;

    const appStyle =
      showChatDock && chatDockHeight > 0
        ? ({ "--chat-dock-height": `${chatDockHeight}px` } as CSSProperties)
        : undefined;

    return (
      <div
        className={`app${showChatDock ? " has-chat-dock" : ""}${showReportPage ? " app-report-mode" : ""}${showInboxPage ? " app-inbox-mode" : ""}`}
        style={appStyle}
      >
        <ResizeHandles />
        {!showReportPage && !showInboxPage && launcher}
        <div className={`app-scroll${collapsing ? " app-exit" : ""}`}>
          {!showReportPage && !showInboxPage && sessions.length > 0 && (
            <div className="desktop-session-picker">
              <SessionList
                sessions={sessions}
                activeId={sessionId}
                onSelect={selectSession}
                overlay
              />
            </div>
          )}
          {!showReportPage && showDesktopStatus && (
            <div className="desktop-session-status">
              {busy && <div className="busy-banner">{busy}</div>}
              {session?.lastError && (
                <div className="busy-banner error-banner">{session.lastError}</div>
              )}
            </div>
          )}
          {showInboxPage ? (
            <AutomationInbox items={savedWorkflows} onBack={() => setPage("monitor")} />
          ) : !session ? (
            <Welcome desktop={desktop} onLoadDemo={loadDemo} busy={busy} />
          ) : page === "report" ? (
            <ReportPage
              observations={observations}
              session={session}
              report={report}
              reporting={reporting}
              canGenerate={canGenerateReport}
              onBack={() => setPage("monitor")}
              onGenerate={generateReport}
            />
          ) : (
            <main className="layout">
              <section className="col-main">
                <AgentAwareness
                  session={session}
                  observations={observations}
                  reportSummary={
                    <ReportStatusCard
                      session={session}
                      report={report}
                      reporting={reporting}
                      canGenerate={canGenerateReport}
                      onOpen={() => setPage("report")}
                      onGenerate={generateReport}
                    />
                  }
                />
                <Timeline sessionId={sessionId} observations={observations} usage={session.usage} />
              </section>
            </main>
          )}
        </div>
        {showChatDock && (
          <div className="chat-dock">
            <Chat
              sessionId={sessionId!}
              messages={chat}
              enabled={canChat}
              onHeightChange={setChatDockHeight}
            />
          </div>
        )}
      </div>
    );
  }

  // Web build: classic topbar with controls (no native window to collapse).
  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-right">
          <Controls
            desktop={desktop}
            session={session}
            busy={busy}
            onStart={startFocus}
            onStop={stopFocus}
            onLoadDemo={loadDemo}
            onNewSession={newSession}
            onGenerateReport={generateReport}
            onOpenInbox={openInbox}
            inboxActive={page === "inbox"}
            inboxCount={savedWorkflows.length}
          />
        </div>
      </header>

      {busy && <div className="busy-banner">{busy}</div>}
      {session?.lastError && <div className="busy-banner error-banner">{session.lastError}</div>}

      {page !== "inbox" && page !== "report" && (
        <SessionList sessions={sessions} activeId={sessionId} onSelect={selectSession} />
      )}
      {page === "inbox" ? (
        <AutomationInbox items={savedWorkflows} onBack={() => setPage("monitor")} />
      ) : !session ? (
        <Welcome desktop={desktop} onLoadDemo={loadDemo} busy={busy} />
      ) : page === "report" ? (
        <ReportPage
          observations={observations}
          session={session}
          report={report}
          reporting={reporting}
          canGenerate={canGenerateReport}
          onBack={() => setPage("monitor")}
          onGenerate={generateReport}
        />
      ) : (
        <main className="layout">
          <section className="col-main">
            <AgentAwareness
              session={session}
              observations={observations}
              reportSummary={
                <ReportStatusCard
                  session={session}
                  report={report}
                  reporting={reporting}
                  canGenerate={canGenerateReport}
                  onOpen={() => setPage("report")}
                  onGenerate={generateReport}
                />
              }
            />
            <Timeline sessionId={sessionId} observations={observations} usage={session.usage} />
          </section>
          <section className="col-side">
            <Chat sessionId={sessionId!} messages={chat} enabled={canChat} />
          </section>
        </main>
      )}
    </div>
  );
}

function ReportStatusCard({
  session,
  report,
  reporting,
  canGenerate,
  onOpen,
  onGenerate,
}: {
  session: Session;
  report: Report | null;
  reporting: boolean;
  canGenerate: boolean;
  onOpen: () => void;
  onGenerate: () => void;
}) {
  const hasLoadedReport = Boolean(report);
  const hasReportRecord = Boolean(report || session.reportId);
  const statusLabel = reporting
    ? hasReportRecord
      ? "Updating"
      : "Generating"
    : hasLoadedReport
      ? "Ready"
      : session.reportId
        ? "Loading"
        : "Not created";
  const description = reporting
    ? hasReportRecord
      ? hasLoadedReport
        ? "The agent is amending this session report. You can keep reviewing the current version."
        : "The agent is amending this session report. The current version is loading."
      : "The agent is reviewing the attention timeline and writing the report."
    : hasLoadedReport
      ? report!.updatedAt
        ? `Updated ${new Date(report!.updatedAt).toLocaleString([], reportDateFormat)}`
        : `Created ${new Date(report!.createdAt).toLocaleString([], reportDateFormat)}`
      : session.reportId
        ? "Loading the saved report for this session."
        : session.status === "active"
          ? "Stop monitoring to generate a report for this session."
          : "Generate a report when you want a written summary of this session.";

  return (
    <div className="report-nav" aria-live={reporting ? "polite" : undefined}>
      <div className="report-nav-row">
        <div className="report-nav-head">
          <span
            className="report-nav-dot"
            data-state={
              reporting ? "live" : hasLoadedReport ? "ready" : session.reportId ? "loading" : "idle"
            }
          >
            {reporting && <span className="report-spinner" aria-hidden />}
          </span>
          <div className="report-nav-copy">
            <div className="report-nav-title-row">
              <div className="report-nav-title">Session report</div>
              <div
                className="report-nav-status"
                data-state={
                  reporting
                    ? "live"
                    : hasLoadedReport
                      ? "ready"
                      : session.reportId
                        ? "loading"
                        : "idle"
                }
              >
                {statusLabel}
              </div>
            </div>
            <p>{description}</p>
          </div>
        </div>
        <div className="report-nav-actions">
          {hasLoadedReport && (
            <Button className="report-nav-cta" size="sm" onClick={onOpen}>
              Open Report
            </Button>
          )}
          {!hasReportRecord && canGenerate && !reporting && (
            <Button className="report-nav-cta" size="sm" onClick={onGenerate}>
              Generate report
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

const reportDateFormat: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
};

function ReportPage({
  observations,
  session,
  report,
  reporting,
  canGenerate,
  onBack,
  onGenerate,
}: {
  observations: Observation[];
  session: Session;
  report: Report | null;
  reporting: boolean;
  canGenerate: boolean;
  onBack: () => void;
  onGenerate: () => void;
}) {
  const reportTitle =
    report?.objective || session.currentIntent || session.title || "Untitled session";

  return (
    <main className="secondary-page report-page">
      <header className="secondary-page-nav report-page-head">
        <Button
          className="secondary-page-back report-back"
          variant="secondary"
          size="sm"
          onClick={onBack}
        >
          <ArrowLeft aria-hidden />
        </Button>
        <div className="secondary-page-title">
          <h1>Session Report</h1>
        </div>
      </header>

      <div className="secondary-page-content report-page-content">
        <div className="report-page-content-title">
          <h2>{reportTitle}</h2>
        </div>

        {reporting && (
          <ReportPendingCard
            updating={Boolean(session.reportId)}
            hasReport={Boolean(report || session.reportId)}
          />
        )}
        {report ? (
          <ReportView observations={observations} report={report} />
        ) : (
          <div className="report-empty">
            <strong>No report yet</strong>
            <p className="muted">
              {reporting
                ? "The agent is writing this session report. It will appear here as soon as it is ready."
                : session.reportId
                  ? "Loading the saved report for this session."
                  : session.status === "active"
                    ? "Stop monitoring before generating a written report."
                    : "Generate a report to create a written summary of this session."}
            </p>
            {canGenerate && !reporting && !session.reportId && (
              <Button size="sm" onClick={onGenerate}>
                Generate report
              </Button>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

function ReportPendingCard({ updating, hasReport }: { updating: boolean; hasReport: boolean }) {
  return (
    <div className="report-pending" aria-live="polite">
      <span className="report-spinner" aria-hidden />
      <div>
        <strong>{updating ? "Updating your session report" : "Writing your session report"}</strong>
        <p className="muted">
          {hasReport
            ? "The current version remains available while the agent amends it."
            : "The agent is reviewing this session’s attention timeline. This usually takes a few moments."}
        </p>
      </div>
    </div>
  );
}

function userTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

function monitoringLabelFor({
  captureState,
  monitoringStatus,
  sessionUpdateInFlight,
  stopping,
}: {
  captureState: CaptureState;
  monitoringStatus: MonitoringStatus;
  sessionUpdateInFlight: boolean;
  stopping: boolean;
}): string {
  if (stopping) return "Stopping";
  if (captureState === "capturing") return "Capturing";
  if (monitoringStatus.phase === "analyzing" || sessionUpdateInFlight) return "Analyzing";
  return "Monitoring";
}

function liveMonitoringPhaseFor({
  captureState,
  monitoringStatus,
  sessionUpdateInFlight,
  stopping,
}: {
  captureState: CaptureState;
  monitoringStatus: MonitoringStatus;
  sessionUpdateInFlight: boolean;
  stopping: boolean;
}): LiveMonitoringPhase {
  if (stopping) return "stopping";
  if (captureState === "capturing") return "capturing";
  if (monitoringStatus.phase === "analyzing" || sessionUpdateInFlight) return "analyzing";
  return "monitoring";
}

function Launcher({
  busy,
  monitoring,
  label,
  phase,
  expanded,
  onStart,
  onStop,
  onNew,
  onOpenInbox,
  inboxActive,
  inboxCount,
  onToggleExpand,
}: {
  busy: string | null;
  monitoring: boolean;
  label: string;
  phase: LiveMonitoringPhase;
  expanded: boolean;
  onStart: () => void;
  onStop: () => void;
  onNew: () => void;
  onOpenInbox: () => void;
  inboxActive: boolean;
  inboxCount: number;
  onToggleExpand: () => void;
}) {
  const disabled = Boolean(busy);

  return (
    <div className={expanded ? "launcher-bar lb-header" : "launcher-bar"}>
      <button className="lb-btn lb-ghost" onClick={onNew} disabled={disabled} title="New session">
        <PlusIcon />
        <span>New</span>
      </button>

      <div className="lb-center">
        {monitoring ? (
          <div className="lb-live" data-phase={phase}>
            <span className="lb-livedot" />
            <span className="lb-livelabel">
              <span className="lb-livelabel-text" key={label}>
                {label}
              </span>
            </span>
            <button className="lb-stop" onClick={onStop} disabled={disabled}>
              <StopIcon />
              <span>Stop</span>
            </button>
          </div>
        ) : (
          <button className="lb-start" onClick={onStart} disabled={disabled}>
            <span className="lb-play-mark" aria-hidden>
              <PlayIcon />
            </span>
            <span>{busy ? "Starting…" : "Start monitoring"}</span>
          </button>
        )}
      </div>

      <div className="lb-right">
        <button
          className={`lb-icon${inboxActive ? " is-active" : ""}`}
          onClick={onOpenInbox}
          disabled={disabled}
          title="Automation Inbox"
          aria-label="Automation Inbox"
        >
          <InboxIcon />
          {inboxCount > 0 && <span className="lb-count">{inboxCount}</span>}
        </button>
        <button
          className="lb-icon"
          onClick={onToggleExpand}
          disabled={disabled}
          title={expanded ? "Collapse" : "Expand"}
          aria-label={expanded ? "Collapse" : "Expand"}
        >
          {expanded ? <CollapseIcon /> : <ExpandIcon />}
        </button>
      </div>
    </div>
  );
}

function PlusIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
function PlayIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor">
      <path
        d="M8 5.5v13l10.5-6.5L8 5.5z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function StopIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
      <rect x="5" y="5" width="14" height="14" rx="2.5" />
    </svg>
  );
}
function ExpandIcon() {
  // Up + down chevrons: signals the window opens vertically.
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M8 9l4-4 4 4M8 15l4 4 4-4" />
    </svg>
  );
}
function CollapseIcon() {
  // Chevrons pointing inward: signals the window collapses back to the bar.
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M8 5l4 4 4-4M8 19l4-4 4 4" />
    </svg>
  );
}

type ResizeDir = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
const RESIZE_DIRS: ResizeDir[] = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];

// Edge/corner grips that drive native window bounds via IPC. Needed because a
// transparent, frameless window can't be resized from the OS edges on macOS.
function ResizeHandles() {
  const startResize = (dir: ResizeDir) => (e: ReactMouseEvent) => {
    const bridge = getBridge();
    if (!bridge?.beginResize) return;
    e.preventDefault();
    e.stopPropagation();
    const startX = e.screenX;
    const startY = e.screenY;
    void bridge.beginResize(dir);

    const onMove = (ev: globalThis.MouseEvent) => {
      void bridge.resizeBy?.({ dx: ev.screenX - startX, dy: ev.screenY - startY });
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      void bridge.endResize?.();
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <div className="rz-layer" aria-hidden>
      {RESIZE_DIRS.map((d) => (
        <div key={d} className={`rz rz-${d}`} onMouseDown={startResize(d)} />
      ))}
    </div>
  );
}

function Welcome({
  desktop,
  onLoadDemo,
  busy,
}: {
  desktop: boolean;
  onLoadDemo: () => void;
  busy: string | null;
}) {
  const copy =
    "Focus watches brief cursor pauses, captures context, and gradually builds a hypothesis of what you are doing. After a session, you can chat about the workflows it found and what to automate later.";

  if (desktop) {
    return (
      <div className="welcome welcome-desktop">
        <div className="welcome-hero">
          <h2>Find opportunities to automate your workflows</h2>
          <p>{copy}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="welcome">
      <h2>Find opportunities to automate your workflows</h2>
      <p>{copy}</p>
      <Button size="lg" onClick={onLoadDemo} disabled={Boolean(busy)}>
        Load a demo session
      </Button>
    </div>
  );
}
