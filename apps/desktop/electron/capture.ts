import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { nativeImage, type NativeImage } from "electron";

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

export interface CapturedFrame {
  fullDataUrl?: string;
  cropDataUrl?: string;
  cropImage?: NativeImage;
}

/** Capture a downscaled full screen + a 250x250 crop centred on the cursor. */
export async function captureFrame(
  cursor: { x: number; y: number },
  display: { x: number; y: number; width: number; height: number },
  captureSize: number,
): Promise<CapturedFrame> {
  const half = Math.floor(captureSize / 2);
  const rx = Math.min(
    Math.max(cursor.x - half, display.x),
    display.x + display.width - captureSize,
  );
  const ry = Math.min(
    Math.max(cursor.y - half, display.y),
    display.y + display.height - captureSize,
  );

  const [full, crop] = await Promise.all([
    screencapture(["-x", "-C"]),
    screencapture(["-x", `-R${rx},${ry},${captureSize},${captureSize}`]),
  ]);

  const result: CapturedFrame = {};
  if (full) {
    const size = full.getSize();
    const targetWidth = Math.min(1024, size.width);
    const resized = full.resize({ width: targetWidth });
    result.fullDataUrl = toJpegDataUrl(resized);
  }
  if (crop) {
    result.cropImage = crop;
    result.cropDataUrl = toJpegDataUrl(crop, 70);
  }
  return result;
}

/** Perceptual difference hash (dHash) of an image, as a 64-bit binary string. */
export function dHash(img: NativeImage): string {
  const small = img.resize({ width: 9, height: 8, quality: "good" });
  const bmp = small.toBitmap(); // BGRA
  const w = 9;
  let bits = "";
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const i = (row * w + col) * 4;
      const j = (row * w + col + 1) * 4;
      const left = bmp[i] + bmp[i + 1] + bmp[i + 2];
      const right = bmp[j] + bmp[j + 1] + bmp[j + 2];
      bits += left < right ? "1" : "0";
    }
  }
  return bits;
}

export function hamming(a: string, b: string): number {
  if (a.length !== b.length) return 64;
  let d = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++;
  return d;
}
