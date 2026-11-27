import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SettingsPage } from "./SettingsPage.js";

describe("SettingsPage", () => {
  it("offers only multimodal models and changes the shared selection", async () => {
    const user = userEvent.setup();
    const onAgentModelChange = vi.fn();
    render(
      <SettingsPage
        keyStatuses={{ openai: { configured: false, encryptionAvailable: true } }}
        agentModel="claude-sonnet-4-6"
        onBack={vi.fn()}
        onAgentModelChange={onAgentModelChange}
        onRefreshKeys={async () => undefined}
        onSaveKey={async () => undefined}
        onClearKey={async () => undefined}
      />,
    );

    expect(screen.getByText("API Keys")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Claude Sonnet 4.6" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Gemini 3.6 Flash" })).toBeInTheDocument();

    await user.selectOptions(
      screen.getByRole("combobox", { name: "AI model" }),
      "gemini-3.6-flash",
    );
    expect(onAgentModelChange).toHaveBeenCalledWith("gemini-3.6-flash");
  });
});

it("saves and clears the OpenAI key and offers an OpenAI model", async () => {
  const user = userEvent.setup();
  const save = vi.fn().mockResolvedValue(undefined);
  const clear = vi.fn().mockResolvedValue(undefined);
  const change = vi.fn();
  render(
    <SettingsPage
      keyStatuses={{ openai: { configured: true, encryptionAvailable: true } }}
      agentModel="gpt-5.4-mini"
      onBack={vi.fn()}
      onAgentModelChange={change}
      onRefreshKeys={async () => undefined}
      onSaveKey={save}
      onClearKey={clear}
    />,
  );
  const input = screen.getByLabelText("OpenAI API key", { selector: "input" });
  await user.type(input, "sk-test-openai-1234567890");
  const region = screen.getByRole("region", { name: "OpenAI API key" });
  const buttons = region.querySelectorAll("button");
  await user.click(buttons[0]);
  expect(save).toHaveBeenCalledWith("openai", "sk-test-openai-1234567890");
  expect(input).toHaveValue("");
  await user.click(buttons[1]);
  expect(clear).toHaveBeenCalledWith("openai");
  expect(screen.getByRole("option", { name: "OpenAI GPT-5.4 mini" })).toBeInTheDocument();
});
