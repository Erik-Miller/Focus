import { useEffect, useRef, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { collection, doc, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import type { ChatMessage, Observation, Report, SavedWorkflow, Session } from "@focus/shared";
import { auth, db } from "./firebase";

/** Recent sessions (newest first) for the session switcher. */
export function useSessions(max = 25): Session[] {
  const [items, setItems] = useState<Session[]>([]);
  useEffect(() => {
    const q = query(collection(db, "sessions"), orderBy("startedAt", "desc"), limit(max));
    return onSnapshot(q, (snap) => {
      setItems(snap.docs.map((d) => d.data() as Session));
    });
  }, [max]);
  return items;
}

export function useSession(sessionId: string | null): Session | null {
  const [session, setSession] = useState<Session | null>(null);
  useEffect(() => {
    if (!sessionId) {
      setSession(null);
      return;
    }
    return onSnapshot(doc(db, "sessions", sessionId), (snap) => {
      setSession(snap.exists() ? (snap.data() as Session) : null);
    });
  }, [sessionId]);
  return session;
}

export function useObservations(sessionId: string | null): Observation[] {
  const [items, setItems] = useState<Observation[]>([]);
  useEffect(() => {
    if (!sessionId) {
      setItems([]);
      return;
    }
    const q = query(
      collection(db, "sessions", sessionId, "observations"),
      orderBy("timestamp", "asc"),
    );
    return onSnapshot(q, (snap) => {
      setItems(snap.docs.map((d) => d.data() as Observation));
    });
  }, [sessionId]);
  return items;
}

export function useChat(sessionId: string | null): ChatMessage[] {
  const [items, setItems] = useState<ChatMessage[]>([]);
  useEffect(() => {
    if (!sessionId) {
      setItems([]);
      return;
    }
    const q = query(collection(db, "sessions", sessionId, "chat"), orderBy("createdAt", "asc"));
    return onSnapshot(q, (snap) => {
      setItems(snap.docs.map((d) => d.data() as ChatMessage));
    });
  }, [sessionId]);
  return items;
}

export function useReport(sessionId: string | null, reportId: string | undefined): Report | null {
  const [report, setReport] = useState<Report | null>(null);
  useEffect(() => {
    if (!sessionId || !reportId) {
      setReport(null);
      return;
    }
    return onSnapshot(doc(db, "sessions", sessionId, "reports", reportId), (snap) => {
      setReport(snap.exists() ? (snap.data() as Report) : null);
    });
  }, [sessionId, reportId]);
  return report;
}

export function useSavedWorkflows(max = 50, onSaveActivity?: () => void): SavedWorkflow[] {
  const [items, setItems] = useState<SavedWorkflow[]>([]);
  const onSaveActivityRef = useRef(onSaveActivity);

  useEffect(() => {
    onSaveActivityRef.current = onSaveActivity;
  }, [onSaveActivity]);

  useEffect(() => {
    let unsubscribeSaved: (() => void) | null = null;
    let seenInitialSnapshot = false;
    let knownUpdatedAtById = new Map<string, number>();
    let latestKnownUpdatedAt = 0;
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      unsubscribeSaved?.();
      unsubscribeSaved = null;
      seenInitialSnapshot = false;
      knownUpdatedAtById = new Map<string, number>();
      latestKnownUpdatedAt = 0;
      if (!user) {
        setItems([]);
        return;
      }

      const q = query(
        collection(db, "users", user.uid, "savedWorkflows"),
        orderBy("updatedAt", "desc"),
        limit(max),
      );
      unsubscribeSaved = onSnapshot(
        q,
        (snap) => {
          const nextItems = snap.docs.map((d) => d.data() as SavedWorkflow);
          if (seenInitialSnapshot) {
            const hasSaveActivity = nextItems.some((item) => {
              const previousUpdatedAt = knownUpdatedAtById.get(item.id);
              return previousUpdatedAt === undefined
                ? item.updatedAt > latestKnownUpdatedAt
                : item.updatedAt > previousUpdatedAt;
            });
            if (hasSaveActivity) onSaveActivityRef.current?.();
          }
          knownUpdatedAtById = new Map(nextItems.map((item) => [item.id, item.updatedAt]));
          latestKnownUpdatedAt = Math.max(0, ...nextItems.map((item) => item.updatedAt));
          seenInitialSnapshot = true;
          setItems(nextItems);
        },
        (err) => {
          console.warn("saved workflows listener failed", err);
          setItems([]);
        },
      );
    });

    return () => {
      unsubscribeSaved?.();
      unsubscribeAuth();
    };
  }, [max]);

  return items;
}
