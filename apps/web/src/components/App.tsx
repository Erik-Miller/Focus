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
import {
  MonitoringController,
  type LiveTimelineBatch,
  type MonitoringStatus,
} from "../monitoring";
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
type StartMonitoringPhase = "starting" | "resuming";
type ReportStartCountdown = {
  sessionId: string;
  targetAt: number;
};

const REPORT_START_COUNTDOWN_MS = 20_000;

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
  const [desktopChatCollapsed, setDesktopChatCollapsed] = useState(false);
  const [startingMonitoring, setStartingMonitoring] = useState<StartMonitoringPhase | null>(null);
  const [localMonitoringSessionId, setLocalMonitoringSessionId] = useState<string | null>(null);
  const [captureState, setCaptureState] = useState<CaptureState>("idle");
  const [reportStartCountdown, setReportStartCountdown] = useState<ReportStartCountdown | null>(
    null,
  );
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

  const desktop = isDesktop();
  const session = useSession(sessionId);
  const observations = useObservations(sessionId);
  const chat = useChat(sessionId);
  const report = useReport(sessionId, session?.reportId);
  const sessions = useSessions();
  const savedWorkflows = useSavedWorkflows();

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
    // Resume the current session if one exists; otherwise open a new session.
    const resumeId = sessionId;
    setStartingMonitoring(resumeId ? "resuming" : "starting");
    try {
      let id = resumeId;
      if (id) {
        await beginMonitoring(id);
        callables.resumeSession({ sessionId: id }).catch((err) => {
          console.error("resume session failed", err);
          if (controllerSessionIdRef.current !== id) return;

          dwellUnsubRef.current?.();
          dwellUnsubRef.current = null;
          captureStateUnsubRef.current?.();
          captureStateUnsubRef.current = null;
          if (captureIdleTimerRef.current) clearTimeout(captureIdleTimerRef.current);

          const controller = controllerRef.current;
          controllerRef.current = null;
          controllerSessionIdRef.current = null;
          setLocalMonitoringSessionId(null);
          setCaptureState("idle");
          setMonitoringStatus({ phase: "idle", bufferCount: 0 });

          void bridge.stopCapture().catch((stopErr) => {
            console.error("stop capture after resume failure failed", stopErr);
          });
          void controller?.stop().catch((stopErr) => {
            console.error("stop controller after resume failure failed", stopErr);
          });
        });
      } else {
        const { data } = await callables.startSession({ title: "Focus session" });
        id = data.sessionId;
        setSessionId(id);
        await beginMonitoring(id);
      }
    } catch (err) {
      console.error("start monitoring failed", err);
      setLocalMonitoringSessionId(null);
    } finally {
      setStartingMonitoring(null);
    }
  }, [sessionId, beginMonitoring, startingMonitoring]);

  const stopFocus = useCallback(() => {
    const bridge = getBridge();
    const id = sessionId;
    // Flip the UI to stopped immediately; never block on the network.
    setStopping(true);
    setStartingMonitoring(null);
    setLocalMonitoringSessionId(null);
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
        if (id) {
          setReportStartCountdown({
            sessionId: id,
            targetAt: Date.now() + REPORT_START_COUNTDOWN_MS,
          });
        }
        if (id) await callables.stopSession({ sessionId: id });
        if (id) await callables.generateReport({ sessionId: id, timeZone: userTimeZone() });
      } catch (err) {
        console.error("stop/flush/report failed", err);
      } finally {
        if (id) clearReportStartCountdown(id);
      }
    })();
  }, [clearReportStartCountdown, sessionId]);

  const loadDemo = useCallback(async () => {
    setBusy("Loading demo session…");
    setLiveTimelineBatches([]);
    try {
      const { data } = await callables.seedDemoSession({});
      setSessionId(data.sessionId);
    } finally {
      setBusy(null);
    }
  }, []);

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
    setReportStartCountdown({
      sessionId,
      targetAt: Date.now() + REPORT_START_COUNTDOWN_MS,
    });
    void callables
      .generateReport({ sessionId, timeZone: userTimeZone() })
      .catch((err) => {
        console.error("report generation failed", err);
      })
      .finally(() => clearReportStartCountdown(sessionId));
  }, [clearReportStartCountdown, sessionId]);

  if (!ready) {
    return <div className="boot">Connecting to Focus…</div>;
  }

  const stopped =
    !startingMonitoring &&
    (session?.status === "stopped" || session?.status === "reporting" || reportStartQueued);
  const canChat = Boolean(session) && (stopped || Boolean(session?.isDemo));
  const canGenerateReport = Boolean(session) && (stopped || Boolean(session?.isDemo));
  const activelyMonitoring = localMonitoringSessionId === sessionId;
  const showInitialReportSummaryStatus = Boolean(
    session && !report && !session.reportId && (reporting || reportStartQueued),
  );
  const hasCurrentSessionReport = Boolean(session && (report || session.reportId));
  const currentSessionReportSummary =
    session && showInitialReportSummaryStatus ? (
      <ReportStatusCard
        session={session}
        report={report}
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

  // Desktop: the compact launcher bar is the persistent header in both states.
  if (desktop) {
    const monitoring =
      activelyMonitoring && !stopping && !reportStartQueued && !startingMonitoring;
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
        startingLabel={startingLabel}
        expanded={expanded}
        onStart={startFocus}
        onStop={stopFocus}
        onNew={newSession}
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
                onDelete={deleteSession}
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
            <Welcome
              desktop={desktop}
              onStart={startFocus}
              onLoadDemo={loadDemo}
              busy={busy}
              startingLabel={startingLabel}
            />
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
                  <div className="current-session-label">Current Session</div>
                  <AgentAwareness
                    session={session}
                    observations={observations}
                  />
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

  // Web build: classic topbar with controls (no native window to collapse).
  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-right">
          <Controls
            desktop={desktop}
            session={session}
            busy={busy}
            startingLabel={startingLabel}
            onStart={startFocus}
            onStop={stopFocus}
            onLoadDemo={loadDemo}
            onNewSession={newSession}
            onGenerateReport={generateReport}
            onOpenInbox={openInbox}
            inboxActive={page === "inbox"}
            inboxCount={savedWorkflows.length}
            reportCountdownLabel={reportStartCountdownLabel}
          />
        </div>
      </header>

      {busy && <div className="busy-banner">{busy}</div>}
      {session?.lastError && <div className="busy-banner error-banner">{session.lastError}</div>}

      {page !== "inbox" && page !== "report" && (
        <SessionList
          sessions={sessions}
          activeId={sessionId}
          onSelect={selectSession}
          onDelete={deleteSession}
        />
      )}
      {page === "inbox" ? (
        <AutomationInbox items={savedWorkflows} onBack={() => setPage("monitor")} />
      ) : !session ? (
        <Welcome
          desktop={desktop}
          onStart={startFocus}
          onLoadDemo={loadDemo}
          busy={busy}
          startingLabel={startingLabel}
        />
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
              <div className="current-session-label">Current Session</div>
              <AgentAwareness
                session={session}
                observations={observations}
              />
            </div>
            <Timeline
              sessionId={sessionId}
              observations={observations}
              liveBatches={liveTimelineBatches}
              usage={session.usage}
            />
          </section>
          <section className="col-side">
            <Chat sessionId={sessionId!} messages={chat} enabled={canChat} />
          </section>
        </main>
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
  reporting,
  reportCountdownLabel,
  canGenerate,
  onOpen,
  onGenerate,
}: {
  session: Session;
  report: Report | null;
  reporting: boolean;
  reportCountdownLabel: string | null;
  canGenerate: boolean;
  onOpen: () => void;
  onGenerate: () => void;
}) {
  const hasLoadedReport = Boolean(report);
  const hasReportRecord = Boolean(report || session.reportId);
  const reportCountdownActive = Boolean(reportCountdownLabel);
  const reportUpdateCountdown = reportCountdownActive && hasReportRecord;
  const reportQueued = reportCountdownActive && !reporting && !hasReportRecord;
  const reportLive = reporting || reportCountdownActive;
  const reportState = reportLive
    ? "live"
    : hasLoadedReport
      ? "ready"
      : session.reportId
        ? "loading"
        : "idle";
  const statusLabel = reportUpdateCountdown
    ? "Updating"
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
    ? reporting
      ? "The current version stays available while the agent updates it."
      : "The current version stays available while final observations save."
    : reportQueued
      ? "Final observations are being saved before the summary starts."
      : reporting
        ? hasReportRecord
          ? hasLoadedReport
            ? "The agent is updating this session summary. You can keep reviewing the current version."
            : "The agent is updating this session summary. The current version is loading."
          : "The agent is reviewing the attention timeline and writing the summary."
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
              {reportCountdownActive && reportCountdownLabel && (
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
          <h1>Session Summary</h1>
        </div>
      </header>

      <div className="secondary-page-content report-page-content">
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
      </div>
    </main>
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
      ? "The current version remains available while the agent amends it."
      : "The agent is reviewing this session's attention timeline. This usually takes a few moments.";

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

function formatReportStartCountdown(seconds: number | null, updating = false): string | null {
  if (seconds === null) return null;
  const label = updating ? "Update" : "Summary";
  if (seconds <= 0) return `${label} starting...`;
  return `${label} starts in ${formatCountdown(seconds)}`;
}

function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
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
  startingLabel,
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
  startingLabel: string | null;
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
  const startPending = Boolean(startingLabel);

  return (
    <div className={expanded ? "launcher-bar lb-header" : "launcher-bar lb-collapsed"}>
      <button
        className="lb-btn lb-ghost"
        onClick={onNew}
        disabled={disabled || startPending}
        title="New session"
      >
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
        ) : startingLabel ? (
          <div className="lb-starting" aria-live="polite">
            <span className="lb-starting-mark" aria-hidden />
            <span className="lb-starting-label">{startingLabel}</span>
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
          title="Workflow Inbox"
          aria-label="Workflow Inbox"
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
  onStart,
  onLoadDemo,
  busy,
  startingLabel,
}: {
  desktop: boolean;
  onStart: () => void;
  onLoadDemo: () => void;
  busy: string | null;
  startingLabel: string | null;
}) {
  const copy =
    "Focus watches brief cursor pauses, captures context, and helps you spot new workflow patterns emerging in your day. After a session, you can review what it found, chat about patterns, and decide what is worth automating and handing off to Claude or an agent to build.";
  const starting = Boolean(startingLabel);
  const startText = startingLabel ?? "Start Monitoring";

  if (desktop) {
    return (
      <div className="welcome welcome-desktop">
        <div className="welcome-hero">
          <h2>
            <span>Discover New</span>
            <span className="welcome-title-accent">Workflow And Automation Opportunities</span>
          </h2>
          <p>{copy}</p>
          <div className="welcome-actions">
            <Button
              className="welcome-start-action"
              size="lg"
              onClick={onStart}
              disabled={Boolean(busy) || starting}
            >
              {startText}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="welcome">
      <h2>
        <span>Discover New</span>
        <span className="welcome-title-accent">Workflow And Automation Opportunities</span>
      </h2>
      <p>{copy}</p>
      <div className="welcome-actions">
        {desktop ? (
          <Button
            className="welcome-start-action"
            size="lg"
            onClick={onStart}
            disabled={Boolean(busy) || starting}
          >
            {startText}
          </Button>
        ) : (
          <Button size="lg" onClick={onLoadDemo} disabled={Boolean(busy)}>
            Load a demo session
          </Button>
        )}
      </div>
    </div>
  );
}
