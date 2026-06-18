import { contextBridge, ipcRenderer } from "electron";
import type { DwellInput } from "@focus/shared";

type CaptureState = "idle" | "capturing";

contextBridge.exposeInMainWorld("focus_bridge", {
  isDesktop: true,
  startCapture: () => ipcRenderer.invoke("focus:start"),
  stopCapture: () => ipcRenderer.invoke("focus:stop"),
  setWindowMode: (mode: "compact" | "full") => ipcRenderer.invoke("focus:windowMode", mode),
  setKeepInFront: (value: boolean) => ipcRenderer.invoke("focus:setKeepInFront", value),
  beginMove: () => ipcRenderer.invoke("focus:beginMove"),
  moveBy: (delta: { dx: number; dy: number }) => ipcRenderer.invoke("focus:moveBy", delta),
  endMove: () => ipcRenderer.invoke("focus:endMove"),
  beginResize: (dir: string) => ipcRenderer.invoke("focus:beginResize", dir),
  resizeBy: (delta: { dx: number; dy: number }) => ipcRenderer.invoke("focus:resizeBy", delta),
  endResize: () => ipcRenderer.invoke("focus:endResize"),
  closeWindow: () => ipcRenderer.invoke("focus:close"),
  runAutomation: (input: { target: "desktop" | "terminal"; title: string; prompt: string }) =>
    ipcRenderer.invoke("focus:runAutomation", input),
  getPermissions: () => ipcRenderer.invoke("focus:permissions"),
  onDwell: (cb: (dwell: DwellInput) => void) => {
    const listener = (_event: unknown, dwell: DwellInput) => cb(dwell);
    ipcRenderer.on("focus:dwell", listener);
    return () => ipcRenderer.removeListener("focus:dwell", listener);
  },
  onCaptureState: (cb: (state: CaptureState) => void) => {
    const listener = (_event: unknown, state: CaptureState) => cb(state);
    ipcRenderer.on("focus:capture-state", listener);
    return () => ipcRenderer.removeListener("focus:capture-state", listener);
  },
});
