import { useEffect, useRef, useState } from "react";
import type { ChatMessage, Observation, Report, SavedWorkflow, Session } from "@focus/shared";
import { getBridge } from "./platform";

function useLocalQuery<T>(
  kind: string,
  fallback: T,
  sessionId?: string | null,
  reportId?: string,
  max?: number,
): T {
  const [value, setValue] = useState<T>(fallback);
  const fallbackRef = useRef(fallback);
  useEffect(() => {
    let active = true;
    let revision = 0;
    setValue(fallbackRef.current);
    const bridge = getBridge();
    if (!bridge || sessionId === null || (kind === "report" && !reportId)) return;
    const refresh = async () => {
      const current = ++revision;
      try {
        const result = await bridge.localQuery({ kind, sessionId, reportId, max });
        if (active && current === revision) setValue(result as T);
      } catch (error) {
        console.error("Local data query failed", error);
      }
    };
    const unsubscribe = bridge.onLocalChange(() => {
      void refresh();
    });
    void refresh();
    return () => {
      active = false;
      unsubscribe();
    };
  }, [kind, sessionId, reportId, max]);
  return value;
}
export function useSessions(max = 25): Session[] {
  return useLocalQuery("sessions", [], undefined, undefined, max);
}
export function useSession(id: string | null): Session | null {
  return useLocalQuery("session", null, id);
}
export function useObservations(id: string | null): Observation[] {
  return useLocalQuery("observations", [], id);
}
export function useChat(id: string | null): ChatMessage[] {
  return useLocalQuery("chat", [], id);
}
export function useReport(id: string | null, reportId?: string): Report | null {
  return useLocalQuery("report", null, id, reportId);
}
export function useSavedWorkflows(max = 50, onSaveActivity?: () => void): SavedWorkflow[] {
  const items = useLocalQuery<SavedWorkflow[]>("savedWorkflows", [], undefined, undefined, max);
  const previous = useRef<Map<string, number> | null>(null);
  useEffect(() => {
    if (
      previous.current &&
      items.some((item) => item.updatedAt > (previous.current?.get(item.id) ?? 0))
    )
      onSaveActivity?.();
    previous.current = new Map(items.map((item) => [item.id, item.updatedAt]));
  }, [items, onSaveActivity]);
  return items;
}
