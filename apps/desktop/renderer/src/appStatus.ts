import type { CaptureState } from "./platform";
import type { MonitoringStatus } from "./monitoring";
import type { LiveMonitoringPhase } from "./components/DesktopLauncher";

export function formatReportStartCountdown(
  seconds: number | null,
  updating = false,
): string | null {
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

export function monitoringLabelFor({
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

export function liveMonitoringPhaseFor({
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
