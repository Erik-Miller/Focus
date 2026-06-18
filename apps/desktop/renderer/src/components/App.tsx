import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { ensureSignedIn, callables } from "@/firebase";
import { getBridge, type CaptureState } from "@/platform";
import { MonitoringController, type LiveTimelineBatch, type MonitoringStatus } from "../monitoring";
import {
  formatReportStartCountdown,
  liveMonitoringPhaseFor,
  monitoringLabelFor,
} from "../appStatus";
import type { Observation, Report, Session } from "@focus/shared";
import {
  useChat,
  useObservations,
  useReport,
  useSavedWorkflows,
  useSession,
  useSessions,
} from "../hooks";
import { AgentAwareness } from "./AgentAwareness";
import { Timeline } from "./Timeline";
import { Chat } from "./Chat";
import { ReportView } from "./ReportView";
import { SessionList } from "./SessionList";
import { AutomationInbox } from "./AutomationInbox";
import { Button } from "@/components/ui/button";
import { Launcher, ResizeHandles } from "./DesktopLauncher";
import { SecondaryPage } from "./SecondaryPage";

const SESSION_KEY = "focus.sessionId";
const WINDOW_DRAG_IGNORE_SELECTOR = [
  "button",
  "a",
  "input",
  "textarea",
  "select",
  "summary",
  "[role='button']",
  "[role='menu']",
  "[data-slot='button']",
  "[contenteditable='true']",
  ".rz",
  ".chat-input",
  ".chat-resize-handle",
  ".chat-expand-tab",
  ".tl-thumb",
  ".tl-strip",
  ".image-tray",
  ".image-tray-backdrop",
  ".sl-menu",
].join(",");
type AppPage = "monitor" | "report" | "inbox";
type StartMonitoringPhase = "starting" | "resuming";
type ReportStartCountdown = {
  sessionId: string;
  targetAt: number;
};

function isMissingSessionError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? String(error.code) : "";
  const message = "message" in error ? String(error.message) : "";
  return code === "not-found" || code === "functions/not-found" || message.includes("not-found");
}

export function App() {
  const [ready, setReady] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(() =>
    localStorage.getItem(SESSION_KEY),
  );
  // Optimistic stop: flip the UI out of "monitoring" the instant the user hits
  // Stop, while the flush/stop/report run in the background.
  const [stopping, setStopping] = useState(false);
  // Keeps the expanded page mounted briefly while it fades out on collapse.
  const [collapsing, setCollapsing] = useState(false);
  // Start open in the Electron shell.
  const [expanded, setExpanded] = useState(true);
  const [page, setPage] = useState<AppPage>("monitor");
  const [chatDockHeight, setChatDockHeight] = useState(0);
  const [desktopChatCollapsed, setDesktopChatCollapsed] = useState(false);
  const [inboxPulseKey, setInboxPulseKey] = useState(0);
  const [startingMonitoring, setStartingMonitoring] = useState<StartMonitoringPhase | null>(null);
  const [localMonitoringSessionId, setLocalMonitoringSessionId] = useState<string | null>(null);
  const [captureState, setCaptureState] = useState<CaptureState>("idle");
  const [reportStartCountdown, setReportStartCountdown] = useState<ReportStartCountdown | null>(
    null,
  );
  const [reportPreparingSessionId, setReportPreparingSessionId] = useState<string | null>(null);
  const [countdownNow, setCountdownNow] = useState(() => Date.now());
  const [monitoringStatus, setMonitoringStatus] = useState<MonitoringStatus>({
    phase: "idle",
    bufferCount: 0,
  });
  const [liveTimelineBatches, setLiveTimelineBatches] = useState<LiveTimelineBatch[]>([]);
  const controllerRef = useRef<MonitoringController | null>(null);
  const controllerSessionIdRef = useRef<string | null>(null);
  const viewedSessionIdRef = useRef<string | null>(sessionId);
  const dwellUnsubRef = useRef<(() => void) | null>(null);
  const captureStateUnsubRef = useRef<(() => void) | null>(null);
  const captureIdleTimerRef = useRef<number | null>(null);

  const session = useSession(sessionId);
  const observations = useObservations(sessionId);
  const chat = useChat(sessionId);
  const report = useReport(sessionId, session?.reportId);
  const sessions = useSessions();
  const triggerInboxPulse = useCallback(() => {
    setInboxPulseKey((key) => key + 1);
  }, []);
  const savedWorkflows = useSavedWorkflows(50, triggerInboxPulse);

  // Switch the viewed session (review past sessions + their reports).
  const selectSession = useCallback((id: string) => {
    viewedSessionIdRef.current = id;
    setLiveTimelineBatches([]);
    setSessionId(id);
    setPage("monitor");
    setExpanded(true);
    setCollapsing(false);
  }, []);

  const reporting = session?.status === "reporting";
  const reportPreparing = Boolean(
    reportPreparingSessionId && reportPreparingSessionId === sessionId && !reporting,
  );
  const startingLabel = startingMonitoring
    ? startingMonitoring === "resuming"
      ? "Resuming monitoring"
      : "Starting monitoring"
    : null;
  const reportStartCountdownLabel = formatReportStartCountdown(
    reportStartCountdown?.sessionId === sessionId
      ? Math.max(0, Math.ceil((reportStartCountdown.targetAt - countdownNow) / 1000))
      : null,
    Boolean(report || session?.reportId),
  );
  const reportStartQueued = Boolean(reportStartCountdownLabel);

  useEffect(() => {
    ensureSignedIn().then(() => setReady(true));
  }, []);

  useEffect(() => {
    viewedSessionIdRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    if (!reportStartCountdown) return;
    setCountdownNow(Date.now());
    const timer = window.setInterval(() => setCountdownNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [reportStartCountdown]);

  useEffect(() => {
    if (!reportStartCountdown) return;
    if (reportStartCountdown.sessionId !== sessionId) {
      setReportStartCountdown(null);
    }
  }, [reportStartCountdown, sessionId]);

  useEffect(() => {
    if (!reportPreparingSessionId) return;
    if (reportPreparingSessionId !== sessionId || reporting || Boolean(session?.lastError)) {
      setReportPreparingSessionId(null);
    }
  }, [reportPreparingSessionId, reporting, session?.lastError, sessionId]);

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
      viewedSessionIdRef.current = null;
      setLiveTimelineBatches([]);
      setPage((current) => (current === "report" ? "monitor" : current));
    }
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId || controllerSessionIdRef.current !== sessionId || observations.length === 0) {
      return;
    }
    const controller = controllerRef.current;
    if (!controller) return;
    controller.acknowledgeObserved(new Set(observations.map((observation) => observation.id)));
  }, [observations, sessionId]);

  // Once the session is no longer active, the optimistic stop has landed.
  useEffect(() => {
    if (session?.status !== "active") setStopping(false);
  }, [session?.status]);

  // Wire a controller + capture/dwell listeners to a (new or resumed) session id.
  const beginMonitoring = useCallback(async (id: string) => {
    const bridge = getBridge();
    if (!bridge) return;
    setReportStartCountdown(null);
    setReportPreparingSessionId(null);
    viewedSessionIdRef.current = id;
    controllerSessionIdRef.current = id;
    setLiveTimelineBatches([]);
    setPage("monitor");
    setMonitoringStatus({ phase: "idle", bufferCount: 0 });
    setCaptureState("idle");
    let controller: MonitoringController | null = null;
    const handleLiveBatches = (batches: LiveTimelineBatch[]) => {
      if (controllerRef.current === controller && viewedSessionIdRef.current === id) {
        setLiveTimelineBatches(batches);
      }
    };
    controller = new MonitoringController(
      id,
      undefined,
      undefined,
      setMonitoringStatus,
      handleLiveBatches,
    );
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
    setLocalMonitoringSessionId(id);
  }, []);

  const clearReportStartCountdown = useCallback((id: string) => {
    setReportStartCountdown((current) => (current?.sessionId === id ? null : current));
  }, []);

  const startFocus = useCallback(async () => {
    const bridge = getBridge();
    if (!bridge) return;
    if (startingMonitoring) return;
    // Stay compact: starting drops into a live monitoring state in the bar.
    setStopping(false);
    setReportStartCountdown(null);
    setReportPreparingSessionId(null);
    // Resume only when the selected session document still exists. A stale
    // localStorage id can survive Firebase cleanup and must start fresh.
    const resumeId = sessionId && session?.id === sessionId ? sessionId : null;
    setStartingMonitoring(resumeId ? "resuming" : "starting");
    try {
      if (resumeId) {
        await beginMonitoring(resumeId);
        void callables.resumeSession({ sessionId: resumeId }).catch((err) => {
          if (!isMissingSessionError(err)) {
            console.error("resume session failed after local monitoring started", err);
            return;
          }
          console.warn("stale session id could not be resumed", err);
          const activeController = controllerRef.current;
          activeController?.discard();
          controllerRef.current = null;
          controllerSessionIdRef.current = null;
          dwellUnsubRef.current?.();
          dwellUnsubRef.current = null;
          captureStateUnsubRef.current?.();
          captureStateUnsubRef.current = null;
          if (captureIdleTimerRef.current) clearTimeout(captureIdleTimerRef.current);
          void bridge.stopCapture();
          setCaptureState("idle");
          setMonitoringStatus({ phase: "idle", bufferCount: 0 });
          setLocalMonitoringSessionId(null);
          setLiveTimelineBatches([]);
          localStorage.removeItem(SESSION_KEY);
          setSessionId(null);
          viewedSessionIdRef.current = null;
        });
        return;
      }

      {
        const { data } = await callables.startSession({ title: "Focus session" });
        setSessionId(data.sessionId);
        await beginMonitoring(data.sessionId);
      }
    } catch (err) {
      console.error("start monitoring failed", err);
      setLocalMonitoringSessionId(null);
    } finally {
      setStartingMonitoring(null);
    }
  }, [session?.id, sessionId, beginMonitoring, startingMonitoring]);

  const stopFocus = useCallback(() => {
    const bridge = getBridge();
    const id = sessionId;
    // Flip the UI to stopped immediately; never block on the network.
    setStopping(true);
    setStartingMonitoring(null);
    setLocalMonitoringSessionId(null);
    if (id) {
      setReportStartCountdown(null);
      setReportPreparingSessionId(id);
    }
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
    controllerSessionIdRef.current = null;
    // Flush remaining dwells, mark the session stopped, and kick off the report
    // — all in the background. The UI reflects status via the session listener.
    void (async () => {
      try {
        if (bridge) await bridge.stopCapture();
        if (controller) await controller.stop();
        if (id) await callables.stopSession({ sessionId: id });
        if (id) await callables.generateReport({ sessionId: id, timeZone: userTimeZone() });
      } catch (err) {
        console.error("stop/flush/report failed", err);
      } finally {
        if (id) clearReportStartCountdown(id);
        if (id) {
          setReportPreparingSessionId((current) => (current === id ? null : current));
        }
      }
    })();
  }, [clearReportStartCountdown, sessionId]);

  // "New" should only clear the current workspace and stop any active capture.
  // Starting the next capture stays behind the explicit Start monitoring button.
  const newSession = useCallback(async () => {
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
    setLiveTimelineBatches([]);
    viewedSessionIdRef.current = null;
    const prev = controllerRef.current;
    controllerRef.current = null;
    controllerSessionIdRef.current = null;
    setLocalMonitoringSessionId(null);
    localStorage.removeItem(SESSION_KEY);
    setStopping(false);
    setStartingMonitoring(null);
    setReportStartCountdown(null);
    setReportPreparingSessionId(null);
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

  const deleteSession = useCallback(
    async (id: string) => {
      const deletingCurrentSession = id === sessionId;
      if (deletingCurrentSession) {
        const bridge = getBridge();
        dwellUnsubRef.current?.();
        dwellUnsubRef.current = null;
        captureStateUnsubRef.current?.();
        captureStateUnsubRef.current = null;
        if (captureIdleTimerRef.current) clearTimeout(captureIdleTimerRef.current);
        setCaptureState("idle");
        setMonitoringStatus({ phase: "idle", bufferCount: 0 });
        setLiveTimelineBatches([]);
        viewedSessionIdRef.current = null;
        const controller = controllerRef.current;
        controller?.discard();
        controllerRef.current = null;
        controllerSessionIdRef.current = null;
        setLocalMonitoringSessionId(null);
        setStopping(false);
        setStartingMonitoring(null);
        setReportStartCountdown(null);
        setReportPreparingSessionId(null);
        setSessionId(null);
        setPage("monitor");
        localStorage.removeItem(SESSION_KEY);
        if (bridge) await bridge.stopCapture();
      }

      await callables.deleteSession({ sessionId: id });
    },
    [sessionId],
  );

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
    setReportStartCountdown(null);
    setReportPreparingSessionId(sessionId);
    void callables
      .generateReport({ sessionId, timeZone: userTimeZone() })
      .catch((err) => {
        console.error("report generation failed", err);
      })
      .finally(() => {
        clearReportStartCountdown(sessionId);
        setReportPreparingSessionId((current) => (current === sessionId ? null : current));
      });
  }, [clearReportStartCountdown, sessionId]);

  const startWindowDrag = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    if (event.defaultPrevented) return;
    if (event.button !== 0) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest(WINDOW_DRAG_IGNORE_SELECTOR)) return;

    const bridge = getBridge();
    if (!bridge?.beginMove || !bridge.moveBy || !bridge.endMove) return;

    event.preventDefault();
    const startX = event.screenX;
    const startY = event.screenY;
    void bridge.beginMove();

    const onMove = (moveEvent: MouseEvent) => {
      void bridge.moveBy({ dx: moveEvent.screenX - startX, dy: moveEvent.screenY - startY });
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      void bridge.endMove();
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp, { once: true });
  }, []);

  if (!ready) {
    return <div className="boot">Connecting to Focus…</div>;
  }

  const stopped =
    !startingMonitoring &&
    (session?.status === "stopped" ||
      session?.status === "reporting" ||
      reportStartQueued ||
      reportPreparing);
  const canChat = Boolean(session) && (stopped || Boolean(session?.isDemo));
  const canGenerateReport = Boolean(session) && (stopped || Boolean(session?.isDemo));
  const activelyMonitoring = Boolean(sessionId && localMonitoringSessionId === sessionId);
  const showReportSummaryStatus = Boolean(
    session &&
    (reportPreparing ||
      (!report && !session.reportId && (reporting || reportStartQueued)) ||
      (Boolean(report || session.reportId) && reporting)),
  );
  const hasCurrentSessionReport = Boolean(session && (report || session.reportId));
  const currentSessionReportSummary =
    session && showReportSummaryStatus ? (
      <ReportStatusCard
        session={session}
        report={report}
        preparing={reportPreparing}
        reporting={reporting}
        reportCountdownLabel={reportStartCountdownLabel}
        canGenerate={canGenerateReport}
        onOpen={() => setPage("report")}
        onGenerate={generateReport}
      />
    ) : session && hasCurrentSessionReport ? (
      <ReportSection
        loading={!report && Boolean(session.reportId)}
        report={report}
        countdownLabel={reportStartCountdownLabel}
        onOpen={() => setPage("report")}
      />
    ) : undefined;
  const monitoringLabel = monitoringLabelFor({
    captureState,
    monitoringStatus,
    sessionUpdateInFlight: Boolean(activelyMonitoring && session?.updateInFlight),
    stopping,
  });
  const liveMonitoringPhase = liveMonitoringPhaseFor({
    captureState,
    monitoringStatus,
    sessionUpdateInFlight: Boolean(activelyMonitoring && session?.updateInFlight),
    stopping,
  });

  if (!getBridge()) {
    return <div className="boot">Open Focus from the desktop app.</div>;
  }

  const monitoring = activelyMonitoring && !stopping && !reportStartQueued && !startingMonitoring;
  const showInboxPage = page === "inbox";
  const showReportPage = Boolean(session && page === "report");
  const showChatDock = Boolean(session && page === "monitor");
  const showDesktopStatus = Boolean(!showInboxPage && session?.lastError);
  const launcher = (
    <Launcher
      busy={null}
      monitoring={monitoring}
      label={monitoringLabel}
      phase={liveMonitoringPhase}
      startingLabel={startingLabel}
      expanded={expanded}
      onStart={startFocus}
      onStop={stopFocus}
      onNew={newSession}
      onOpenInbox={openInbox}
      inboxActive={page === "inbox"}
      inboxCount={savedWorkflows.length}
      inboxPulseKey={inboxPulseKey}
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
      onMouseDown={startWindowDrag}
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
              onDelete={deleteSession}
              overlay
            />
          </div>
        )}
        {!showReportPage && showDesktopStatus && (
          <div className="desktop-session-status">
            {session?.lastError && (
              <div className="busy-banner error-banner">{session.lastError}</div>
            )}
          </div>
        )}
        {showInboxPage ? (
          <AutomationInbox items={savedWorkflows} onBack={() => setPage("monitor")} />
        ) : !session ? (
          <Welcome onStart={startFocus} startingLabel={startingLabel} />
        ) : page === "report" ? (
          <ReportPage
            observations={observations}
            session={session}
            report={report}
            reporting={reporting}
            reportCountdownLabel={reportStartCountdownLabel}
            canGenerate={canGenerateReport}
            onBack={() => setPage("monitor")}
            onGenerate={generateReport}
          />
        ) : (
          <main className="layout">
            <section className="col-main">
              {currentSessionReportSummary && (
                <div className="session-report-section">
                  <div className="current-session-label">Session Report</div>
                  {currentSessionReportSummary}
                </div>
              )}
              <div className="current-session-section">
                <div className="current-session-label">Current Focus</div>
                <AgentAwareness session={session} observations={observations} />
              </div>
              <Timeline
                sessionId={sessionId}
                observations={observations}
                liveBatches={liveTimelineBatches}
                usage={session.usage}
              />
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
            collapsed={desktopChatCollapsed}
            onCollapsedChange={setDesktopChatCollapsed}
          />
        </div>
      )}
    </div>
  );
}

function ReportSection({
  loading,
  report,
  countdownLabel,
  onOpen,
}: {
  loading: boolean;
  report: Report | null;
  countdownLabel: string | null;
  onOpen: () => void;
}) {
  const timestampLabel = reportTimestampLabel(report);
  const detailItems = reportDetailItems(report);
  const showCountdown = Boolean(countdownLabel);

  return (
    <section
      className="report-open-section"
      aria-label="Session Report"
      aria-live={showCountdown ? "polite" : undefined}
    >
      <div className="report-open-copy">
        {loading ? (
          <div className="report-open-details">Loading report details</div>
        ) : detailItems.length > 0 ? (
          <div className="report-open-details">
            {detailItems.map((item) => (
              <span className="report-open-stat" key={item.label}>
                <strong>{item.value}</strong>
                <span>{item.label}</span>
              </span>
            ))}
          </div>
        ) : null}
      </div>
      <div className="report-open-side">
        {showCountdown && <span className="report-open-countdown">{countdownLabel}</span>}
        <div className="report-open-action-row">
          <span className="report-open-meta">
            {timestampLabel ?? (loading ? "Loading saved report" : "Report available")}
          </span>
          <Button className="report-open-action" size="sm" onClick={onOpen} disabled={loading}>
            View Report
          </Button>
        </div>
      </div>
    </section>
  );
}

function ReportStatusCard({
  session,
  report,
  preparing,
  reporting,
  reportCountdownLabel,
  canGenerate,
  onOpen,
  onGenerate,
}: {
  session: Session;
  report: Report | null;
  preparing: boolean;
  reporting: boolean;
  reportCountdownLabel: string | null;
  canGenerate: boolean;
  onOpen: () => void;
  onGenerate: () => void;
}) {
  const hasLoadedReport = Boolean(report);
  const hasReportRecord = Boolean(report || session.reportId);
  const reportCountdownActive = Boolean(reportCountdownLabel);
  const reportUpdateCountdown = reportCountdownActive && hasReportRecord && !reporting;
  const reportQueued = reportCountdownActive && !preparing && !reporting && !hasReportRecord;
  const reportLive = preparing || reporting || reportCountdownActive;
  const reportState = reportLive
    ? "live"
    : hasLoadedReport
      ? "ready"
      : session.reportId
        ? "loading"
        : "idle";
  const statusLabel = reportUpdateCountdown
    ? "Updating"
    : preparing
      ? "Preparing"
      : reportQueued
        ? "Queued"
        : reporting
          ? hasReportRecord
            ? "Updating"
            : "Generating"
          : hasLoadedReport
            ? "Ready"
            : session.reportId
              ? "Loading"
              : "Not created";
  const description = reportUpdateCountdown
    ? "The current version stays available while final observations save."
    : preparing
      ? hasReportRecord
        ? "The agent is finishing analysis of the recent session images before updating this summary."
        : "The agent is finishing analysis of the recent session images before writing the summary."
      : reportQueued
        ? "Final observations are being saved before the summary starts."
        : reporting
          ? hasReportRecord
            ? hasLoadedReport
              ? "The agent is finishing analysis of the recent session images before updating this summary."
              : "The agent is finishing analysis of the recent session images before updating this summary. The current version is loading."
            : "The agent is finishing analysis of the recent session images before writing the summary."
          : hasLoadedReport
            ? report!.updatedAt
              ? `Updated ${new Date(report!.updatedAt).toLocaleString([], reportDateFormat)}`
              : `Created ${new Date(report!.createdAt).toLocaleString([], reportDateFormat)}`
            : session.reportId
              ? "Loading the saved summary for this session."
              : session.status === "active"
                ? "Stop monitoring to generate a summary for this session."
                : "Generate a written summary of this session.";

  return (
    <div className="report-nav" aria-live={reportLive ? "polite" : undefined}>
      <div className="report-nav-row">
        <div className="report-nav-head">
          <span className="report-nav-dot" data-state={reportState}>
            {reportLive && <span className="report-spinner" aria-hidden />}
          </span>
          <div className="report-nav-copy">
            <div className="report-nav-title-row">
              <div className="report-nav-title">Status</div>
              <div className="report-nav-status" data-state={reportState}>
                {statusLabel}
              </div>
              {reportCountdownActive && !reporting && reportCountdownLabel && (
                <div className="report-nav-countdown">{reportCountdownLabel}</div>
              )}
            </div>
            <p>{description}</p>
          </div>
        </div>
        <div className="report-nav-actions">
          {hasLoadedReport && (
            <Button className="report-nav-cta" size="sm" onClick={onOpen}>
              View Report
            </Button>
          )}
          {!hasReportRecord && canGenerate && !reportLive && (
            <Button className="report-nav-cta" size="sm" onClick={onGenerate}>
              Generate summary
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

function reportTimestampLabel(report: Report | null): string | null {
  if (!report) return null;
  const timestamp = report.updatedAt ?? report.createdAt;
  const prefix = report.updatedAt ? "Updated" : "Created";
  return `${prefix} ${new Date(timestamp).toLocaleString([], reportDateFormat)}`;
}

function reportDetailItems(report: Report | null): Array<{ label: string; value: number }> {
  if (!report) return [];
  return [
    { label: "Focus areas", value: report.focusAreas.length },
    { label: "Workflows", value: report.workflows.length },
    { label: "Moments", value: report.significantScreenshots.length },
  ].filter((item) => item.value > 0);
}

function ReportPage({
  observations,
  session,
  report,
  reporting,
  reportCountdownLabel,
  canGenerate,
  onBack,
  onGenerate,
}: {
  observations: Observation[];
  session: Session;
  report: Report | null;
  reporting: boolean;
  reportCountdownLabel: string | null;
  canGenerate: boolean;
  onBack: () => void;
  onGenerate: () => void;
}) {
  const reportTitle =
    report?.objective || session.currentIntent || session.title || "Untitled session";

  return (
    <SecondaryPage
      title="Session Summary"
      className="report-page"
      headerClassName="report-page-head"
      contentClassName="report-page-content"
      backClassName="report-back"
      onBack={onBack}
    >
      <div className="report-page-content-title">
        <h2>{reportTitle}</h2>
      </div>

      {(reporting || reportCountdownLabel) && (
        <ReportPendingCard
          queued={Boolean(reportCountdownLabel && !reporting)}
          updating={Boolean(session.reportId)}
          hasReport={Boolean(report || session.reportId)}
          countdownLabel={reportCountdownLabel}
        />
      )}
      {report ? (
        <ReportView observations={observations} report={report} />
      ) : (
        <div className="report-empty">
          <strong>No summary yet</strong>
          <p className="muted">
            {reportCountdownLabel && !reporting
              ? `${reportCountdownLabel}. Final observations are being saved first.`
              : reporting
                ? "The agent is writing this session summary. It will appear here as soon as it is ready."
                : session.reportId
                  ? "Loading the saved summary for this session."
                  : session.status === "active"
                    ? "Stop monitoring before generating a written summary."
                    : "Generate a written summary of this session."}
          </p>
          {canGenerate && !reporting && !reportCountdownLabel && !session.reportId && (
            <Button size="sm" onClick={onGenerate}>
              Generate summary
            </Button>
          )}
        </div>
      )}
    </SecondaryPage>
  );
}

function ReportPendingCard({
  queued,
  updating,
  hasReport,
  countdownLabel,
}: {
  queued: boolean;
  updating: boolean;
  hasReport: boolean;
  countdownLabel: string | null;
}) {
  const title = queued
    ? updating
      ? "Summary update queued"
      : "Session summary queued"
    : updating
      ? "Updating your session summary"
      : "Writing your session summary";
  const body = queued
    ? hasReport
      ? `${countdownLabel}. The current version remains available.`
      : `${countdownLabel}. The agent will start after the final capture flush.`
    : countdownLabel && updating
      ? `${countdownLabel}. The current version remains available.`
      : hasReport
        ? "The current version remains available while the agent finishes analysis of the recent session images and updates this summary."
        : "The agent is finishing analysis of the recent session images before writing the session summary.";

  return (
    <div className="report-pending" aria-live="polite">
      <span className="report-spinner" aria-hidden />
      <div>
        <strong>{title}</strong>
        <p className="muted">{body}</p>
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

function Welcome({
  onStart,
  startingLabel,
}: {
  onStart: () => void;
  startingLabel: string | null;
}) {
  const copy =
    "Focus watches brief cursor pauses, captures context, and helps you spot new workflow patterns emerging in your day. After a session, you can review what it found, chat about patterns, and decide what is worth automating and handing off to Claude or an agent to build.";
  const starting = Boolean(startingLabel);
  const startText = startingLabel ?? "Start Monitoring";

  return (
    <div className="welcome welcome-desktop">
      <div className="welcome-hero">
        <h2>
          <span>Discover New</span>
          <span className="welcome-title-accent">Workflow And Automation</span>
        </h2>
        <p>{copy}</p>
        <div className="welcome-actions">
          <Button className="welcome-start-action" size="lg" onClick={onStart} disabled={starting}>
            {startText}
          </Button>
        </div>
      </div>
    </div>
  );
}
