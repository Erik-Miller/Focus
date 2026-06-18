import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { nativeImage, type NativeImage } from "electron";
import { dHashImage, hamming } from "./imageHash.js";
import { cursorCropRect } from "./crop.js";

const exec = promisify(execFile);

export interface ActiveWindow {
  app: string;
  title: string;
}

/** Frontmost app + window title via AppleScript (macOS). Degrades gracefully. */
export async function getActiveWindow(): Promise<ActiveWindow> {
  let app = "";
  let title = "";
  try {
    const { stdout } = await exec("osascript", [
      "-e",
      'tell application "System Events" to get name of first application process whose frontmost is true',
    ]);
    app = stdout.trim();
  } catch {
    /* ignore */
  }
  try {
    const { stdout } = await exec("osascript", [
      "-e",
      'tell application "System Events" to get title of front window of (first application process whose frontmost is true)',
    ]);
    title = stdout.trim();
  } catch {
    /* accessibility may be denied or no window */
  }
  return { app: app || "Unknown", title };
}

async function screencapture(args: string[]): Promise<NativeImage | null> {
  const file = path.join(tmpdir(), `focus-${randomUUID()}.png`);
  try {
    await exec("screencapture", [...args, file]);
    const buf = await readFile(file);
    return nativeImage.createFromBuffer(buf);
  } catch {
    return null;
  } finally {
    unlink(file).catch(() => undefined);
  }
}

function toJpegDataUrl(img: NativeImage, quality = 60): string {
  return `data:image/jpeg;base64,${img.toJPEG(quality).toString("base64")}`;
}

export interface CapturedCrop {
  cropDataUrl?: string;
  cropImage?: NativeImage;
}

/** Capture a square crop centred on the cursor. */
export async function captureCursorCrop(
  cursor: { x: number; y: number },
  display: { x: number; y: number; width: number; height: number },
  captureSize: number,
): Promise<CapturedCrop> {
  const rect = cursorCropRect(cursor, display, captureSize);

  const crop = await screencapture(["-x", `-R${rect.x},${rect.y},${rect.width},${rect.height}`]);
  const result: CapturedCrop = {};
  if (crop) {
    result.cropImage = crop;
    result.cropDataUrl = toJpegDataUrl(crop, 70);
  }
  return result;
}

/** Capture a downscaled full-screen context frame. */
export async function captureFullScreen(): Promise<string | undefined> {
  const full = await screencapture(["-x", "-C"]);
  if (!full) return undefined;
  const size = full.getSize();
  const targetWidth = Math.min(1024, size.width);
  const resized = full.resize({ width: targetWidth });
  return toJpegDataUrl(resized);
}

/** Perceptual difference hash (dHash) of an image, as a 64-bit binary string. */
export function dHash(img: NativeImage): string {
  return dHashImage(img);
}

export { hamming };
export { cursorCropRect };
