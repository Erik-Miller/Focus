import type { DwellInput } from "@focus/shared";

const DB_NAME = "focus-local-observation-images";
const DB_VERSION = 1;
const STORE_NAME = "images";
const MAX_STORED_IMAGES = 500;

export interface LocalObservationImages {
  cursorCropDataUrl?: string;
  fullScreenshotDataUrl?: string;
}

interface StoredObservationImages extends LocalObservationImages {
  key: string;
  sessionId: string;
  observationId: string;
  timestamp: number;
  updatedAt: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

export function createClientObservationId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `obs_${crypto.randomUUID()}`;
  }
  return `obs_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

export async function saveObservationImages(sessionId: string, dwell: DwellInput): Promise<void> {
  if (!dwell.clientObservationId) return;
  if (!dwell.cursorCropDataUrl && !dwell.fullScreenshotDataUrl) return;

  const db = await openDb();
  await putRecord(db, {
    key: imageKey(sessionId, dwell.clientObservationId),
    sessionId,
    observationId: dwell.clientObservationId,
    timestamp: dwell.timestamp,
    updatedAt: Date.now(),
    cursorCropDataUrl: dwell.cursorCropDataUrl,
    fullScreenshotDataUrl: dwell.fullScreenshotDataUrl,
  });
  void pruneOldImages(db).catch((err) => {
    console.warn("Failed to prune local observation images", err);
  });
}

export async function loadObservationImages(
  sessionId: string | null,
  observationIds: string[],
): Promise<Map<string, LocalObservationImages>> {
  const result = new Map<string, LocalObservationImages>();
  if (!sessionId || observationIds.length === 0) return result;

  const db = await openDb();
  await Promise.all(
    observationIds.map(async (observationId) => {
      const record = await getRecord(db, imageKey(sessionId, observationId));
      if (!record) return;
      result.set(observationId, {
        cursorCropDataUrl: record.cursorCropDataUrl,
        fullScreenshotDataUrl: record.fullScreenshotDataUrl,
      });
    }),
  );
  return result;
}

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB is unavailable."));
  }
  dbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open image cache."));
  });
  return dbPromise;
}

function putRecord(db: IDBDatabase, record: StoredObservationImages): Promise<void> {
  return transactionDone(db, "readwrite", (store) => {
    store.put(record);
  });
}

function getRecord(db: IDBDatabase, key: string): Promise<StoredObservationImages | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).get(key);
    request.onsuccess = () => resolve(request.result as StoredObservationImages | undefined);
    request.onerror = () => reject(request.error ?? new Error("Could not read image cache."));
    tx.onerror = () => reject(tx.error ?? new Error("Could not read image cache."));
  });
}

function pruneOldImages(db: IDBDatabase): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      const records = (request.result as StoredObservationImages[]).sort(
        (a, b) => b.updatedAt - a.updatedAt,
      );
      records.slice(MAX_STORED_IMAGES).forEach((record) => {
        store.delete(record.key);
      });
    };
    request.onerror = () => reject(request.error ?? new Error("Could not prune image cache."));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Could not prune image cache."));
  });
}

function transactionDone(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    run(tx.objectStore(STORE_NAME));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Image cache transaction failed."));
  });
}

function imageKey(sessionId: string, observationId: string): string {
  return `${sessionId}:${observationId}`;
}
