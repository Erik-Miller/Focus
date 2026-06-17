import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

if (getApps().length === 0) {
  initializeApp();
}

export const db = getFirestore();
// Optional capture fields (screenshot URLs, mouse, frameHash) are absent when a
// screencapture/permission fails. Skip undefined values instead of throwing the
// "Cannot use undefined as a Firestore value" error that aborts the whole batch.
db.settings({ ignoreUndefinedProperties: true });
export const bucket = getStorage().bucket();
export { FieldValue };
