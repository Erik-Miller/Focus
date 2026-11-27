import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import ReactMarkdown from "react-markdown";
import { directAddressText, type AgentModelId, type ChatMessage } from "@focus/shared";
import { callables } from "@/localApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Props {
  sessionId: string;
  messages: ChatMessage[];
  enabled: boolean;
  onHeightChange?: (height: number) => void;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  getAgentRequestCredentials?: () => Promise<{
    agentModel: AgentModelId;
  }>;
}

type ActiveChatRun = { id: string; phase: "running" | "stopping" };
type ResizeDrag = { pointerId: number; startY: number; startHeight: number; moved: boolean };
const RESPONSE_HEIGHT_MIN = 132;
const RESPONSE_HEIGHT_MAX_FALLBACK = 1200;
const RESPONSE_HEIGHT_DEFAULT = 190;
const CHAT_VIEWPORT_OFFSET = 100;
const EMPTY_CHAT_MESSAGE =
  "Focus has information about this session. Ask anything to figure out what you were working on, which workflows showed up, or what might be worth automating.";

const SUGGESTIONS = [
  "What was I working on?",
  "What workflows did you notice?",
  "Which of these should I automate later?",
];

export function Chat({
  sessionId,
  messages,
  enabled,
  onHeightChange,
  collapsed: controlledCollapsed,
  onCollapsedChange,
  getAgentRequestCredentials,
}: Props) {
  const [input, setInput] = useState("");
  const [activeRun, setActiveRun] = useState<ActiveChatRun | null>(null);
  const [pendingMessages, setPendingMessages] = useState<ChatMessage[]>([]);
  const [uncontrolledCollapsed, setUncontrolledCollapsed] = useState(false);
  const [collapsing, setCollapsing] = useState(false);
  const [opening, setOpening] = useState(false);
  const [responseHeight, setResponseHeight] = useState(RESPONSE_HEIGHT_DEFAULT);
  const rootRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const activeRunRef = useRef<ActiveChatRun | null>(null);
  const resizeDragRef = useRef<ResizeDrag | null>(null);
  const suppressHandleClickRef = useRef(false);
  const animationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const running = activeRun !== null;
  const stopping = activeRun?.phase === "stopping";
  const collapsed = controlledCollapsed ?? uncontrolledCollapsed;
  const serverUserRunIds = new Set(
    messages
      .filter((message) => message.role === "user" && message.runId)
      .map((message) => message.runId),
  );
  const visibleMessages = [
    ...messages,
    ...pendingMessages.filter((message) => !serverUserRunIds.has(message.runId)),
  ]
    .slice()
    .sort((a, b) => a.createdAt - b.createdAt);
  const showIntro = !running && visibleMessages.length === 0;
  const showResponse = running || visibleMessages.length > 0 || showIntro;

  useEffect(() => {
    activeRunRef.current = activeRun;
  }, [activeRun]);

  function setActiveChatRun(nextRun: ActiveChatRun | null) {
    activeRunRef.current = nextRun;
    setActiveRun(nextRun);
  }

  function currentActiveRunId() {
    return activeRunRef.current?.id;
  }

  useEffect(() => {
    setPendingMessages([]);
  }, [sessionId]);

  useEffect(() => {
    if (pendingMessages.length === 0) return;
    const nextServerUserRunIds = new Set(
      messages
        .filter((message) => message.role === "user" && message.runId)
        .map((message) => message.runId),
    );
    setPendingMessages((current) =>
      current.filter((message) => !nextServerUserRunIds.has(message.runId)),
    );
  }, [messages, pendingMessages.length]);

  useEffect(() => {
    if (!onHeightChange || !rootRef.current) return;
    const node = rootRef.current;
    const notify = () => onHeightChange(Math.ceil(node.getBoundingClientRect().height));
    notify();
    const observer = new ResizeObserver(notify);
    observer.observe(node);
    return () => observer.disconnect();
  }, [collapsed, onHeightChange]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [visibleMessages.length, showIntro, activeRun]);

  useEffect(() => {
    return () => {
      if (animationTimerRef.current) clearTimeout(animationTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (collapsed || !showResponse) return;
    const onResize = () => {
      setResponseHeight((current) => clamp(current, RESPONSE_HEIGHT_MIN, getMaxResponseHeight()));
    };
    window.addEventListener("resize", onResize);
    onResize();
    return () => window.removeEventListener("resize", onResize);
  }, [collapsed, showResponse]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || activeRunRef.current) return;
    const runId = createRunId();
    const run: ActiveChatRun = { id: runId, phase: "running" };
    setInput("");
    setPendingMessages((current) => [
      ...current,
      {
        id: `local-${runId}`,
        role: "user",
        content: message,
        createdAt: Date.now(),
        runId,
      },
    ]);
    setActiveChatRun(run);
    try {
      const credentials = await readAgentRequestCredentials(getAgentRequestCredentials);
      await callables.chatWithAgent({
        sessionId,
        runId,
        message,
        ...credentials,
      });
    } catch (err) {
      if (currentActiveRunId() === runId) console.error(err);
      setPendingMessages((current) => current.filter((message) => message.runId !== runId));
    } finally {
      if (currentActiveRunId() === runId) setActiveChatRun(null);
    }
  }

  async function stopActiveRun() {
    const run = activeRunRef.current;
    if (!run || run.phase === "stopping") return;
    setActiveChatRun({ ...run, phase: "stopping" });
    try {
      await callables.cancelChatRun({ sessionId, runId: run.id });
      if (currentActiveRunId() === run.id) setActiveChatRun(null);
    } catch (err) {
      console.error(err);
      if (currentActiveRunId() === run.id) setActiveChatRun({ ...run, phase: "running" });
    }
  }

  function startResize(event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    const startHeight = clamp(responseHeight, RESPONSE_HEIGHT_MIN, getMaxResponseHeight());
    setResponseHeight(startHeight);
    resizeDragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startHeight,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function dragResize(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = resizeDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (Math.abs(event.clientY - drag.startY) > 3) drag.moved = true;
    const nextHeight = drag.startHeight + (drag.startY - event.clientY);
    setResponseHeight(clamp(nextHeight, RESPONSE_HEIGHT_MIN, getMaxResponseHeight()));
  }

  function stopResize(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = resizeDragRef.current;
    if (drag?.pointerId !== event.pointerId) return;
    suppressHandleClickRef.current = drag.moved;
    resizeDragRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function collapseFromHandle() {
    if (suppressHandleClickRef.current) {
      suppressHandleClickRef.current = false;
      return;
    }
    collapseChat();
  }

  function collapseChat() {
    if (collapsed || collapsing) return;
    if (animationTimerRef.current) clearTimeout(animationTimerRef.current);
    setOpening(false);
    setCollapsing(true);
    animationTimerRef.current = setTimeout(() => {
      setChatCollapsed(true);
      setCollapsing(false);
      animationTimerRef.current = null;
    }, 190);
  }

  function expandChat() {
    if (animationTimerRef.current) clearTimeout(animationTimerRef.current);
    setChatCollapsed(false);
    setCollapsing(false);
    setOpening(true);
    animationTimerRef.current = setTimeout(() => {
      setOpening(false);
      animationTimerRef.current = null;
    }, 220);
  }

  function setChatCollapsed(nextCollapsed: boolean) {
    if (controlledCollapsed === undefined) setUncontrolledCollapsed(nextCollapsed);
    onCollapsedChange?.(nextCollapsed);
  }

  function getMaxResponseHeight(): number {
    const maxChatHeight = Math.max(RESPONSE_HEIGHT_MIN, window.innerHeight - CHAT_VIEWPORT_OFFSET);
    const chat = rootRef.current?.querySelector<HTMLElement>(".chat");
    const scrollArea = rootRef.current?.querySelector<HTMLElement>(".chat-scroll-area");
    if (!chat || !scrollArea) return Math.max(RESPONSE_HEIGHT_MIN, RESPONSE_HEIGHT_MAX_FALLBACK);

    const chromeHeight =
      chat.getBoundingClientRect().height - scrollArea.getBoundingClientRect().height;
    return Math.max(RESPONSE_HEIGHT_MIN, maxChatHeight - Math.max(0, chromeHeight));
  }

  if (collapsed) {
    return (
      <div ref={rootRef} className="chat-shell chat-shell-collapsed">
        <button
          type="button"
          className="chat-expand-tab"
          aria-label="Expand chat"
          title="Expand chat"
          onClick={expandChat}
        >
          <span className="chat-expand-label">Chat</span>
          <span className="chat-expand-line" aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className={`chat-shell${collapsing ? " chat-shell-collapsing" : ""}${
        opening ? " chat-shell-opening" : ""
      }`}
      style={{ "--chat-response-height": `${responseHeight}px` } as CSSProperties}
    >
      <Card
        className={`chat gap-0 overflow-hidden py-0${showResponse ? " has-response" : " is-compact"}`}
      >
        <button
          type="button"
          className="chat-resize-handle"
          aria-label={showResponse ? "Resize or collapse chat" : "Collapse chat"}
          title={showResponse ? "Drag to resize, click to collapse" : "Collapse chat"}
          onPointerDown={showResponse ? startResize : undefined}
          onPointerMove={showResponse ? dragResize : undefined}
          onPointerUp={showResponse ? stopResize : undefined}
          onPointerCancel={showResponse ? stopResize : undefined}
          onClick={collapseFromHandle}
        />
        {showResponse && (
          <>
            <ScrollArea className="chat-scroll-area">
              <div className="chat-scroll">
                {showIntro && (
                  <div className="msg msg-agent msg-intro">
                    <div className="msg-role">Focus</div>
                    <div className="msg-body">
                      <MarkdownMessage content={EMPTY_CHAT_MESSAGE} />
                    </div>
                  </div>
                )}
                {visibleMessages.map((m) => (
                  <div key={m.id} className={`msg msg-${m.role}`}>
                    <div className="msg-role">{m.role === "user" ? "You" : "Focus"}</div>
                    <div className="msg-body">
                      {m.role === "agent" ? <AgentMessage content={m.content} /> : m.content}
                    </div>
                  </div>
                ))}
                {running && (
                  <div className="msg msg-agent">
                    <div className="msg-role">Focus</div>
                    <div className="msg-body thinking">
                      <span>{stopping ? "Stopping" : "Thinking"}</span>
                      <span className="thinking-dots" aria-hidden>
                        <span />
                        <span />
                        <span />
                      </span>
                    </div>
                  </div>
                )}
                <div ref={endRef} />
              </div>
            </ScrollArea>

            {!running && enabled && visibleMessages.length <= 1 && (
              <div className="suggestions">
                {SUGGESTIONS.map((s) => (
                  <Button
                    key={s}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-full"
                    onClick={() => send(s)}
                  >
                    {s}
                  </Button>
                ))}
              </div>
            )}
          </>
        )}

        <form
          className="chat-input"
          onSubmit={(e) => {
            e.preventDefault();
            if (running) return;
            send(input);
          }}
        >
          <Input
            className="flex-1"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Message..."
            disabled={!enabled || running}
          />
          <Button
            type={running ? "button" : "submit"}
            className={running ? "chat-submit chat-submit-stop" : "chat-submit"}
            variant={running ? "secondary" : "default"}
            onClick={running ? stopActiveRun : undefined}
            disabled={stopping || (!running && (!enabled || !input.trim()))}
          >
            {running ? (stopping ? "Stopping" : "Stop") : "Send"}
          </Button>
        </form>
      </Card>
    </div>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

async function readAgentRequestCredentials(
  getCredentials?: () => Promise<{ agentModel: AgentModelId }>,
): Promise<{ agentModel?: AgentModelId }> {
  if (!getCredentials) return {};
  try {
    return await getCredentials();
  } catch (err) {
    console.error("Failed to read agent request credentials", err);
    return {};
  }
}

function createRunId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `chat_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

function AgentMessage({ content }: { content: string }) {
  const addressedContent = directAddressText(content);
  const markdown = formatAgentMarkdown(addressedContent);
  return <MarkdownMessage content={markdown} />;
}

function MarkdownMessage({ content }: { content: string }) {
  return (
    <div className="msg-markdown">
      <ReactMarkdown>{content}</ReactMarkdown>
    </div>
  );
}

const AGENT_FIELD_LABELS = [
  "The Idea",
  "Idea",
  "Why",
  "How",
  "Automation idea",
  "Recommendation",
  "Next step",
  "Suggested next step",
];
const AGENT_FIELD_LINE_PATTERN = new RegExp(
  `^(?:[-*+]\\s+)?(?:\\*\\*)?(${AGENT_FIELD_LABELS.join("|")}):(?:\\*\\*)?\\s+(.+)$`,
  "i",
);

export function formatAgentMarkdown(content: string): string {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const formatted: string[] = [];

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    const field = trimmed.match(AGENT_FIELD_LINE_PATTERN);

    if (isHorizontalRule(trimmed)) {
      if (formatted.length && formatted[formatted.length - 1] !== "") formatted.push("");
      return;
    }

    if (isPlainAgentHeading(lines, index)) {
      if (formatted.length && formatted[formatted.length - 1] !== "") formatted.push("");
      formatted.push(`### ${trimmed}`);
      return;
    }

    if (field) {
      formatted.push(`**${formatFieldLabel(field[1])}:** ${field[2].trim()}`);
      return;
    }

    formatted.push(line);
  });

  return formatted.join("\n").trim();
}

function isPlainAgentHeading(lines: string[], index: number): boolean {
  const trimmed = lines[index]?.trim() ?? "";
  if (!trimmed || trimmed.length > 96 || /[.!?:]$/.test(trimmed) || isMarkdownLine(trimmed)) {
    return false;
  }

  const next = nextNonEmptyLine(lines, index + 1);
  return Boolean(next && AGENT_FIELD_LINE_PATTERN.test(next.trim()));
}

function isHorizontalRule(line: string): boolean {
  return /^(?:-{3,}|\*{3,}|_{3,})$/.test(line);
}

function nextNonEmptyLine(lines: string[], startIndex: number): string | null {
  for (let i = startIndex; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.trim()) return line;
  }
  return null;
}

function isMarkdownLine(line: string): boolean {
  return /^(#{1,6}\s|[-*+]\s|\d+\.\s|>\s|`{3,}|\*\*.+\*\*)/.test(line);
}

function formatFieldLabel(label: string): string {
  const normalized = label.toLowerCase();
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}
