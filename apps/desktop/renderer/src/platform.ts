import type { DwellInput } from "@focus/shared";

export type CaptureState = "idle" | "capturing";
export type AutomationLaunchTarget = "desktop" | "terminal";
export type WindowMode = "compact" | "full";
export interface AutomationLaunchInput {
  target: AutomationLaunchTarget;
  title: string;
  prompt: string;
}

/** API exposed by the Electron preload bridge when running in the desktop app. */
export interface FocusBridge {
  isDesktop: true;
  startCapture: () => Promise<void>;
  stopCapture: () => Promise<void>;
  setWindowMode: (mode: WindowMode) => Promise<void>;
  setKeepInFront: (value: boolean) => Promise<boolean>;
  beginMove: () => Promise<void>;
  moveBy: (delta: { dx: number; dy: number }) => Promise<void>;
  endMove: () => Promise<void>;
  beginResize: (dir: string) => Promise<void>;
  resizeBy: (delta: { dx: number; dy: number }) => Promise<void>;
  endResize: () => Promise<void>;
  closeWindow: () => Promise<void>;
  runAutomation: (input: AutomationLaunchInput) => Promise<{ ok: boolean; copied: boolean }>;
  onDwell: (cb: (dwell: DwellInput) => void) => () => void;
  onCaptureState: (cb: (state: CaptureState) => void) => () => void;
  getPermissions: () => Promise<{ screen: boolean; accessibility: boolean }>;
}

declare global {
  interface Window {
    focus_bridge?: FocusBridge;
  }
}

export function getBridge(): FocusBridge | null {
  return typeof window !== "undefined" && window.focus_bridge ? window.focus_bridge : null;
}
