import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { app, BrowserWindow, clipboard, ipcMain, screen, shell, systemPreferences } from "electron";
import liquidGlass from "electron-liquid-glass";
import { DEFAULT_MONITORING_CONFIG, type DwellInput, type Novelty } from "@focus/shared";
import { DwellDetector } from "./dwell.js";
import { captureFrame, dHash, hamming, getActiveWindow } from "./capture.js";

const cfg = DEFAULT_MONITORING_CONFIG;
const isDev = process.env.FOCUS_DEV === "1";
const execFileAsync = promisify(execFile);

// Focus is a frameless, transparent, always-on-top floating utility panel (a
// "docklet"): renderer-owned chrome + CSS drag regions, native bounds animation
// for collapsed/expanded states. It launches centered/open, then users can drag
// and resize it while sizing persists across launches.
const DOCKLET_MIN_WIDTH = 370;
const DOCKLET_MIN_HEIGHT = 71;
const DEFAULT_WIDTH = 380;
const COMPACT_HEIGHT = 72;
const DEFAULT_EXPANDED_HEIGHT = 560;
const CENTER_ZONE_FRACTION = 0.25;
const RESIZE_ANIM_MS = 230;
const RESIZE_FRAME_MS = 1000 / 60;

type WindowMode = "compact" | "full";
interface WindowState {
  x: number;
  y: number;
  width: number;
  expandedHeight: number;
}

let win: BrowserWindow | null = null;

let keepInFront = true;
let windowMode: WindowMode = "full";
let expandedHeight = DEFAULT_EXPANDED_HEIGHT;

let resizeAnimToken = 0;
let resizeAnimTimer: ReturnType<typeof setTimeout> | null = null;
let resizeInFlight = false;

// Renderer-driven edge/corner resize (transparent frameless windows can't be
// resized from the native edges, so grips in the UI drive the bounds instead).
let interactiveResize = false;
let resizeStartBounds: Electron.Rectangle | null = null;
let resizeDir = "";

let pollTimer: ReturnType<typeof setInterval> | null = null;
let capturing = false;
const detector = new DwellDetector(cfg.dwellMs, cfg.dwellRadiusPx);
let lastEmitted: { hash: string; app: string; title: string } = { hash: "", app: "", title: "" };

type AutomationTarget = "desktop" | "terminal";
interface AutomationLaunchInput {
  target: AutomationTarget;
  title: string;
  prompt: string;
}

function emitCaptureState(state: "idle" | "capturing") {
  win?.webContents.send("focus:capture-state", state);
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function workAreaFor(bounds: Electron.Rectangle): Electron.Rectangle {
  return screen.getDisplayMatching(bounds).workArea;
}

function windowStatePath(): string {
  return path.join(app.getPath("userData"), "focus-window-state.json");
}

// Keep whichever edge/center the docklet is visually attached to fixed while the
// height changes, then clamp onto the work area.
function preservePositionForSize(
  bounds: Electron.Rectangle,
  width: number,
  height: number,
): Electron.Rectangle {
  const work = workAreaFor(bounds);
  const sourceCenterX = bounds.x + bounds.width / 2;
  const sourceCenterY = bounds.y + bounds.height / 2;
  const workCenterX = work.x + work.width / 2;
  const workCenterY = work.y + work.height / 2;
  const centerZoneWidth = work.width * CENTER_ZONE_FRACTION;
  const centerZoneHeight = work.height * CENTER_ZONE_FRACTION;
  const preserveCenterX = Math.abs(sourceCenterX - workCenterX) <= centerZoneWidth / 2;
  const preserveCenterY = Math.abs(sourceCenterY - workCenterY) <= centerZoneHeight / 2;
  const preserveRight = !preserveCenterX && sourceCenterX > workCenterX;
  const preserveBottom = !preserveCenterY && sourceCenterY > workCenterY;
  const rawX = preserveCenterX
    ? Math.round(sourceCenterX - width / 2)
    : preserveRight
      ? bounds.x + bounds.width - width
      : bounds.x;
  const rawY = preserveCenterY
    ? Math.round(sourceCenterY - height / 2)
    : preserveBottom
      ? bounds.y + bounds.height - height
      : bounds.y;
  const maxX = work.x + work.width - width;
  const maxY = work.y + work.height - height;
  return {
    x: clamp(rawX, work.x, Math.max(work.x, maxX)),
    y: clamp(rawY, work.y, Math.max(work.y, maxY)),
    width,
    height,
  };
}

function clampBoundsWidth(bounds: Electron.Rectangle): Electron.Rectangle {
  const width = Math.max(DOCKLET_MIN_WIDTH, Math.round(bounds.width));
  if (width === bounds.width) return bounds;
  return preservePositionForSize(bounds, width, bounds.height);
}

// ---------------------------------------------------------------------------
// Persisted sizing + centered launch placement
// ---------------------------------------------------------------------------

function getInitialWindowState(): WindowState {
  const work = screen.getPrimaryDisplay().workArea;
  const centeredState = (width: number, expandedHeight: number): WindowState => {
    const safeWidth = clamp(width, DOCKLET_MIN_WIDTH, work.width);
    const safeExpandedHeight = clamp(expandedHeight, 200, work.height);
    return {
      width: safeWidth,
      x: work.x + Math.round((work.width - safeWidth) / 2),
      y: work.y + Math.round((work.height - safeExpandedHeight) / 2),
      expandedHeight: safeExpandedHeight,
    };
  };
  try {
    const parsed = JSON.parse(fs.readFileSync(windowStatePath(), "utf8")) as Partial<WindowState>;
    const width = typeof parsed.width === "number" ? parsed.width : DEFAULT_WIDTH;
    const eh = parsed.expandedHeight ?? DEFAULT_EXPANDED_HEIGHT;
    return centeredState(width, eh);
  } catch {
    return centeredState(DEFAULT_WIDTH, DEFAULT_EXPANDED_HEIGHT);
  }
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;
function schedulePersist(): void {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(persistWindowState, 150);
}

function persistWindowState(): void {
  if (!win || win.isDestroyed()) return;
  const bounds = clampBoundsWidth(win.getBounds());
  const payload: WindowState = {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    expandedHeight,
  };
  try {
    fs.mkdirSync(app.getPath("userData"), { recursive: true });
    fs.writeFileSync(windowStatePath(), JSON.stringify(payload, null, 2));
  } catch (err) {
    console.error("Failed to persist window state", err);
  }
}

// ---------------------------------------------------------------------------
// Animated height (collapsed <-> expanded), anchor-preserving
// ---------------------------------------------------------------------------

function clearResizeAnimation(): void {
  resizeAnimToken += 1;
  if (resizeAnimTimer) {
    clearTimeout(resizeAnimTimer);
    resizeAnimTimer = null;
  }
  resizeInFlight = false;
}

function setBoundsForHeight(window: BrowserWindow, height: number, ref = window.getBounds()): void {
  const width = Math.max(DOCKLET_MIN_WIDTH, ref.width);
  const nextHeight = Math.max(DOCKLET_MIN_HEIGHT, Math.round(height));
  window.setBounds(preservePositionForSize(ref, width, nextHeight), false);
}

function animateHeight(window: BrowserWindow, targetHeight: number): void {
  const startBounds = window.getBounds();
  const startHeight = startBounds.height;
  const startWidth = Math.max(DOCKLET_MIN_WIDTH, startBounds.width);
  const nextHeight = Math.max(DOCKLET_MIN_HEIGHT, Math.round(targetHeight));

  clearResizeAnimation();

  if (Math.abs(nextHeight - startHeight) <= 1) {
    setBoundsForHeight(window, nextHeight, startBounds);
    return;
  }

  const token = resizeAnimToken;
  const startedAt = Date.now();
  resizeInFlight = true;

  const tick = () => {
    if (!win || win.isDestroyed() || win.id !== window.id || token !== resizeAnimToken) {
      resizeInFlight = false;
      return;
    }
    const progress = Math.min(1, (Date.now() - startedAt) / RESIZE_ANIM_MS);
    const eased = 1 - Math.pow(1 - progress, 3);
    const h = Math.round(startHeight + (nextHeight - startHeight) * eased);
    window.setBounds(preservePositionForSize(startBounds, startWidth, h), false);
    if (progress >= 1) {
      resizeAnimTimer = null;
      resizeInFlight = false;
      setBoundsForHeight(window, nextHeight, startBounds);
      return;
    }
    resizeAnimTimer = setTimeout(tick, RESIZE_FRAME_MS);
  };
  tick();
}

function setWindowMode(mode: WindowMode): void {
  if (!win) return;
  windowMode = mode;
  animateHeight(win, mode === "compact" ? COMPACT_HEIGHT : expandedHeight);
}

// Compute new bounds from the drag start, the grip direction, and the cursor
// delta (in screen DIPs), enforcing the minimum size and the work area.
function computeInteractiveBounds(dx: number, dy: number): Electron.Rectangle {
  const start = resizeStartBounds!;
  const work = workAreaFor(start);
  let x = start.x;
  let y = start.y;
  let width = start.width;
  let height = start.height;

  if (resizeDir.includes("e")) width = start.width + dx;
  if (resizeDir.includes("w")) width = start.width - dx;
  if (resizeDir.includes("s")) height = start.height + dy;
  if (resizeDir.includes("n")) height = start.height - dy;

  width = clamp(Math.round(width), DOCKLET_MIN_WIDTH, work.width);
  height = clamp(Math.round(height), DOCKLET_MIN_HEIGHT, work.height);

  // West/north grips move the opposite edge as the size changes.
  if (resizeDir.includes("w")) x = start.x + start.width - width;
  if (resizeDir.includes("n")) y = start.y + start.height - height;

  x = clamp(Math.round(x), work.x, work.x + work.width - width);
  y = clamp(Math.round(y), work.y, work.y + work.height - height);
  return { x, y, width, height };
}

// ---------------------------------------------------------------------------
// Always-on-top (keepInFront)
// ---------------------------------------------------------------------------

function applyKeepInFront(): void {
  if (win && !win.isDestroyed()) win.setAlwaysOnTop(keepInFront);
}

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------

function applyLiquidGlass(window: BrowserWindow) {
  try {
    const handle = window.getNativeWindowHandle();
    const glassId = liquidGlass.addView(handle, {
      cornerRadius: 18,
      tintColor: "#0a0a0b55",
    });
    liquidGlass.unstable_setVariant(glassId, 2);
  } catch (err) {
    console.error("liquid glass unavailable (needs macOS 26+):", err);
    // Fall back to the native vibrancy material so the panel still reads as glass.
    try {
      window.setVibrancy("under-window");
    } catch {
      /* vibrancy unsupported */
    }
  }
}

function createWindow() {
  const initial = getInitialWindowState();
  expandedHeight = initial.expandedHeight;
  windowMode = "full";

  win = new BrowserWindow({
    show: false,
    x: initial.x,
    y: initial.y,
    width: initial.width,
    height: expandedHeight,
    minWidth: DOCKLET_MIN_WIDTH,
    minHeight: DOCKLET_MIN_HEIGHT,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    resizable: true,
    hasShadow: true,
    acceptFirstMouse: true,
    alwaysOnTop: keepInFront,
    roundedCorners: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.webContents.once("did-finish-load", () => {
    if (win) applyLiquidGlass(win);
  });

  // Show without stealing focus from the user's current app (utility panel).
  win.once("ready-to-show", () => {
    applyKeepInFront();
    win?.showInactive();
  });

  win.on("move", () => {
    schedulePersist();
  });

  win.on("resize", () => {
    if (resizeInFlight) return;
    // Remember the user's expanded height so future expansions restore it.
    const h = win!.getBounds().height;
    if (windowMode === "full" && h > COMPACT_HEIGHT + 8) expandedHeight = h;
    schedulePersist();
  });

  win.on("close", persistWindowState);

  win.on("closed", () => {
    win = null;
  });

  if (isDev) {
    win.loadURL("http://localhost:5173");
  } else {
    win.loadFile(path.resolve(__dirname, "..", "..", "web", "dist", "index.html"));
  }
}

// ---------------------------------------------------------------------------
// Capture / dwell
// ---------------------------------------------------------------------------

function classifyNovelty(hash: string, appName: string, title: string): Novelty | "duplicate" {
  const appChanged = appName !== lastEmitted.app;
  const titleChanged = title !== lastEmitted.title;
  const distance = lastEmitted.hash ? hamming(hash, lastEmitted.hash) : 64;

  if (!appChanged && !titleChanged && distance < cfg.duplicateHashDistance) {
    return "duplicate";
  }
  if (appChanged) return "high";
  if (titleChanged || distance >= 14) return "medium";
  return "low";
}

async function onDwell() {
  if (capturing || !win) return;
  capturing = true;
  emitCaptureState("capturing");
  try {
    const cursor = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(cursor).bounds;
    const [{ fullDataUrl, cropDataUrl, cropImage }, activeWin] = await Promise.all([
      captureFrame(cursor, display, cfg.captureSize),
      getActiveWindow(),
    ]);

    const hash = cropImage ? dHash(cropImage) : "";
    const novelty = classifyNovelty(hash, activeWin.app, activeWin.title);
    if (novelty === "duplicate") return;

    lastEmitted = { hash, app: activeWin.app, title: activeWin.title };

    const dwell: DwellInput = {
      timestamp: Date.now(),
      app: activeWin.app,
      windowTitle: activeWin.title,
      mouse: { x: cursor.x, y: cursor.y },
      dwellMs: cfg.dwellMs,
      novelty,
      frameHash: hash,
      fullScreenshotDataUrl: fullDataUrl,
      cursorCropDataUrl: cropDataUrl,
    };
    win.webContents.send("focus:dwell", dwell);
  } catch (err) {
    console.error("capture error", err);
  } finally {
    capturing = false;
    emitCaptureState("idle");
  }
}

function startCapture() {
  if (pollTimer) return;
  pollTimer = setInterval(() => {
    const p = screen.getCursorScreenPoint();
    if (detector.tick(p.x, p.y, Date.now())) {
      void onDwell();
    }
  }, cfg.pollIntervalMs);
}

function stopCapture() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
  if (capturing) emitCaptureState("idle");
}

// ---------------------------------------------------------------------------
// Automation handoff
// ---------------------------------------------------------------------------

function cleanAutomationInput(input: Partial<AutomationLaunchInput>): AutomationLaunchInput {
  const target = input.target === "terminal" ? "terminal" : "desktop";
  const title = String(input.title ?? "Automation candidate")
    .trim()
    .slice(0, 160);
  const prompt = String(input.prompt ?? "").trim();
  if (!prompt) throw new Error("Automation prompt is empty.");
  return {
    target,
    title: title || "Automation candidate",
    prompt: prompt.slice(0, 24_000),
  };
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function appleScriptString(value: string): string {
  return JSON.stringify(value);
}

function promptFilePath(): string {
  const name = `focus-claude-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`;
  return path.join(app.getPath("temp"), name);
}

async function openClaudeDesktop(prompt: string): Promise<void> {
  clipboard.writeText(prompt);
  if (process.platform === "darwin") {
    await execFileAsync("open", ["-a", "Claude"]);
    return;
  }
  await shell.openExternal("https://claude.ai/new");
}

async function openClaudeTerminal(prompt: string): Promise<void> {
  clipboard.writeText(prompt);
  if (process.platform !== "darwin") {
    throw new Error("Launching Claude in Terminal is currently supported on macOS only.");
  }
  await ensureClaudeCli();

  const filePath = promptFilePath();
  fs.writeFileSync(filePath, prompt, { mode: 0o600 });

  const command = [
    `cd ${shellQuote(app.getPath("home"))}`,
    `claude "$(cat ${shellQuote(filePath)})"`,
  ].join(" && ");
  const commandWithCleanup = `${command}; rm -f ${shellQuote(filePath)}`;

  await execFileAsync("osascript", [
    "-e",
    'tell application "Terminal" to activate',
    "-e",
    `tell application "Terminal" to do script ${appleScriptString(commandWithCleanup)}`,
  ]);
}

async function ensureClaudeCli(): Promise<void> {
  const shellPath = process.env.SHELL || "/bin/zsh";
  try {
    await execFileAsync(shellPath, ["-lc", "command -v claude"]);
  } catch {
    throw new Error("Claude CLI was not found. Install it or make sure `claude` is on your PATH.");
  }
}

async function runAutomation(input: Partial<AutomationLaunchInput>) {
  const cleaned = cleanAutomationInput(input);
  if (cleaned.target === "terminal") {
    await openClaudeTerminal(cleaned.prompt);
  } else {
    await openClaudeDesktop(cleaned.prompt);
  }
  return { ok: true, copied: true, title: cleaned.title, target: cleaned.target };
}

// ---------------------------------------------------------------------------
// IPC
// ---------------------------------------------------------------------------

ipcMain.handle("focus:start", () => {
  startCapture();
  return true;
});
ipcMain.handle("focus:stop", () => {
  stopCapture();
  return true;
});
ipcMain.handle("focus:windowMode", (_event, mode: WindowMode) => {
  setWindowMode(mode);
  return true;
});
ipcMain.handle("focus:setKeepInFront", (_event, value: boolean) => {
  keepInFront = Boolean(value);
  applyKeepInFront();
  return keepInFront;
});
ipcMain.handle("focus:beginResize", (_event, dir: string) => {
  if (!win) return false;
  interactiveResize = true;
  resizeDir = String(dir);
  resizeStartBounds = win.getBounds();
  clearResizeAnimation();
  return true;
});
ipcMain.handle("focus:resizeBy", (_event, delta: { dx: number; dy: number }) => {
  if (!win || !interactiveResize || !resizeStartBounds) return false;
  win.setBounds(computeInteractiveBounds(delta?.dx ?? 0, delta?.dy ?? 0), false);
  return true;
});
ipcMain.handle("focus:endResize", () => {
  interactiveResize = false;
  resizeStartBounds = null;
  resizeDir = "";
  schedulePersist();
  return true;
});
ipcMain.handle("focus:close", () => {
  win?.close();
  return true;
});
ipcMain.handle("focus:runAutomation", async (_event, input: Partial<AutomationLaunchInput>) => {
  return runAutomation(input);
});
ipcMain.handle("focus:permissions", () => {
  const screenStatus = systemPreferences.getMediaAccessStatus("screen") === "granted";
  const accessibility = systemPreferences.isTrustedAccessibilityClient(false);
  return { screen: screenStatus, accessibility };
});

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  stopCapture();
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
