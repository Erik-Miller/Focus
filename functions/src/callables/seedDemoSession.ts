import { randomUUID } from "node:crypto";
import { onCall } from "firebase-functions/v2/https";
import type { ChatMessage, Observation, Session } from "@focus/shared";
import { db } from "../firebaseApp.js";
import { solidPngDataUrl } from "../util/png.js";
import { DEMO_DATASET } from "../demo/dataset.js";
import {
  HYPOTHESIS_PATH,
  WORKFLOWS_PATH,
  emptyUsageAggregate,
  requireAuth,
  uploadDataUrl,
} from "./common.js";

/**
 * Clones the bundled demo dataset into a fresh, fully-populated session owned
 * by the caller. No model calls — the understanding is pre-baked so reviewers
 * can immediately inspect it and then chat / generate a report live.
 */
export const seedDemoSession = onCall(
  { timeoutSeconds: 120, memory: "512MiB", region: "us-central1" },
  async (request) => {
    const uid = requireAuth(request);
    const ref = db.collection("sessions").doc();
    const sessionId = ref.id;
    const now = Date.now();
    const baseTime = now - 9 * 60_000;

    const observations: Observation[] = [];
    for (const demo of DEMO_DATASET.observations) {
      const obsId = randomUUID();
      const cropUrl = await uploadDataUrl(
        `screenshots/${sessionId}/${obsId}-crop`,
        solidPngDataUrl(250, 250, demo.color),
      );
      const fullUrl = await uploadDataUrl(
        `screenshots/${sessionId}/${obsId}-full`,
        solidPngDataUrl(320, 200, demo.color),
      );
      observations.push({
        id: obsId,
        sessionId,
        batchId: "demo",
        timestamp: baseTime + demo.offsetMs,
        app: demo.app,
        windowTitle: demo.windowTitle,
        mouse: { x: 640, y: 400 },
        dwellMs: demo.dwellMs,
        novelty: demo.novelty,
        frameHash: "demo",
        fullScreenshotUrl: fullUrl,
        cursorCropUrl: cropUrl,
        summary: demo.summary,
        inferredIntent: demo.inferredIntent,
        confidence: DEMO_DATASET.confidence,
        evidence: demo.evidence,
        alternatives: [],
        suggestedNextAction: "",
      });
    }

    const session: Session = {
      id: sessionId,
      ownerUid: uid,
      status: "stopped",
      isDemo: true,
      title: DEMO_DATASET.title,
      startedAt: baseTime,
      endedAt: now,
      currentIntent: DEMO_DATASET.currentIntent,
      confidence: DEMO_DATASET.confidence,
      activeApps: DEMO_DATASET.activeApps,
      discoveredWorkflows: DEMO_DATASET.discoveredWorkflows,
      agentFiles: {
        [HYPOTHESIS_PATH]: DEMO_DATASET.hypothesisMarkdown,
        [WORKFLOWS_PATH]: DEMO_DATASET.workflowsMarkdown,
      },
      usage: emptyUsageAggregate(),
      lastUpdateAt: now,
      updateInFlight: false,
    };

    const batch = db.batch();
    batch.set(ref, session);
    for (const obs of observations) {
      batch.set(ref.collection("observations").doc(obs.id), obs);
    }
    const welcomeRef = ref.collection("chat").doc();
    const welcome: ChatMessage = {
      id: welcomeRef.id,
      role: "agent",
      content: DEMO_DATASET.welcomeMessage,
      createdAt: now,
    };
    batch.set(welcomeRef, welcome);
    await batch.commit();

    return { sessionId };
  },
);
