import type { Novelty } from "@focus/shared";
import { hamming } from "./imageHash.js";

export interface LastEmittedSnapshot {
  hash: string;
  app: string;
  title: string;
}

export function classifyNoveltyForSnapshot(
  hash: string,
  appName: string,
  title: string,
  lastEmitted: LastEmittedSnapshot,
  duplicateHashDistance: number,
): Novelty | "duplicate" {
  const appChanged = appName !== lastEmitted.app;
  const titleChanged = title !== lastEmitted.title;
  const distance = lastEmitted.hash ? hamming(hash, lastEmitted.hash) : 64;

  if (!appChanged && !titleChanged && distance < duplicateHashDistance) {
    return "duplicate";
  }
  if (appChanged) return "high";
  if (titleChanged || distance >= 14) return "medium";
  return "low";
}

export function shouldCaptureFullScreenSnapshot(
  nextSnapshotNumber: number,
  cadence: number,
): boolean {
  if (cadence <= 0) return false;
  return nextSnapshotNumber % cadence === 0;
}
