import type { DwellInput } from "@focus/shared";
import type { AutomationLaunchInput, FocusBridge, WindowMode } from "../../src/platform";

let dwellListener: ((dwell: DwellInput) => void) | null = null;
let captureStateListener: ((state: "idle" | "capturing") => void) | null = null;

export const bridge: FocusBridge = {
  isDesktop: true,
  startCapture: async () => undefined,
  stopCapture: async () => undefined,
  setWindowMode: async (_mode: WindowMode) => undefined,
  setKeepInFront: async (value: boolean) => value,
  beginMove: async () => undefined,
  moveBy: async () => undefined,
  endMove: async () => undefined,
  beginResize: async () => undefined,
  resizeBy: async () => undefined,
  endResize: async () => undefined,
  closeWindow: async () => undefined,
  runAutomation: async (input: AutomationLaunchInput) => {
    document.body.dataset.lastAutomationTarget = input.target;
    return { ok: true, copied: true };
  },
  getApiKeyStatus: async () => ({ configured: true, encryptionAvailable: true }),
  setApiKey: async () => ({ configured: true, encryptionAvailable: true, savedAt: 1 }),
  localCall: async () => ({}),
  localQuery: async () => [],
  onLocalChange: () => () => undefined,
  clearApiKey: async () => ({ configured: false, encryptionAvailable: true }),
  getPermissions: async () => ({ screen: true, accessibility: true }),
  onDwell: (cb) => {
    dwellListener = cb;
    return () => {
      dwellListener = null;
    };
  },
  onCaptureState: (cb) => {
    captureStateListener = cb;
    return () => {
      captureStateListener = null;
    };
  },
};

export function emitDwell(): void {
  captureStateListener?.("capturing");
  dwellListener?.({
    timestamp: Date.now(),
    app: "Chrome",
    windowTitle: "Focus test harness",
    mouse: { x: 20, y: 30 },
    dwellMs: 300,
    novelty: "high",
    frameHash: "hash",
    cursorCropDataUrl: "data:image/gif;base64,R0lGODlhAQABAAAAACw=",
  });
  captureStateListener?.("idle");
}

export function getBridge(): FocusBridge {
  return bridge;
}
