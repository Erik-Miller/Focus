export type AutomationTarget = "desktop" | "terminal" | "codex";

export interface AutomationLaunchInput {
  target: AutomationTarget;
  title: string;
  prompt: string;
}

export function cleanAutomationInput(input: Partial<AutomationLaunchInput>): AutomationLaunchInput {
  const target =
    input.target === "codex" ? "codex" : input.target === "terminal" ? "terminal" : "desktop";
  const title = String(input.title ?? "Automation candidate")
    .trim()
    .slice(0, 160);
  const prompt = String(input.prompt ?? "").trim();
  if (!prompt) throw new Error("Automation prompt is empty.");
  return {
    target,
    title: title || "Automation candidate",
    prompt: prompt.slice(0, 24_000),
  };
}

export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function appleScriptString(value: string): string {
  return JSON.stringify(value);
}
