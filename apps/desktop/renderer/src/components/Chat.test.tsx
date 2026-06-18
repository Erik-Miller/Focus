import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Chat, formatAgentMarkdown } from "./Chat.js";

const mocks = vi.hoisted(() => ({
  chatWithAgent: vi.fn(),
  cancelChatRun: vi.fn(),
}));

vi.mock("@/firebase", () => ({
  callables: {
    chatWithAgent: mocks.chatWithAgent,
    cancelChatRun: mocks.cancelChatRun,
  },
}));

describe("Chat", () => {
  beforeEach(() => {
    mocks.chatWithAgent.mockReset();
    mocks.cancelChatRun.mockReset();
    mocks.chatWithAgent.mockResolvedValue({ data: { answer: "ok" } });
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: { randomUUID: () => "run_12345678" },
    });
  });

  it("formats agent markdown into readable headings and field labels", () => {
    expect(formatAgentMarkdown("Candidate\nIdea: Build a tool\n---\nWhy: It helps")).toBe(
      "### Candidate\n**Idea:** Build a tool\n\n**Why:** It helps",
    );
  });

  it("sends a chat message with a stable run id and renders the optimistic user turn", async () => {
    const user = userEvent.setup();
    render(<Chat sessionId="session1" messages={[]} enabled />);

    await user.type(screen.getByPlaceholderText("Message..."), "What did I do?");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(mocks.chatWithAgent).toHaveBeenCalledWith({
      sessionId: "session1",
      runId: "run_12345678",
      message: "What did I do?",
    });
    expect(screen.getByText("What did I do?")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Send" })).toBeDisabled());
  });

  it("does not send blank or disabled messages", async () => {
    const user = userEvent.setup();
    render(<Chat sessionId="session1" messages={[]} enabled={false} />);

    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(mocks.chatWithAgent).not.toHaveBeenCalled();
  });
});
