import { ChevronDown, Clipboard, Monitor, Terminal } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import type { AutomationLaunchTarget } from "@/platform";
import { buttonVariants } from "@/components/ui/button";

export function AgentHandoffMenu({
  disabled,
  busy = false,
  onLaunch,
}: {
  disabled?: boolean;
  busy?: boolean;
  onLaunch: (target: AutomationLaunchTarget) => void;
}) {
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger
        className={`${buttonVariants({ size: "sm", variant: "secondary" })} agent-handoff-trigger`}
        data-slot="button"
        disabled={disabled || busy}
      >
        <Clipboard aria-hidden />
        {busy ? "Opening agent…" : "Copy for agent"}
        <ChevronDown aria-hidden />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="agent-handoff-menu"
          align="start"
          sideOffset={6}
          collisionPadding={12}
        >
          <DropdownMenu.Label className="agent-handoff-label">Choose an agent</DropdownMenu.Label>
          <DropdownMenu.Item
            className="agent-handoff-item"
            onSelect={() => onLaunch("codex")}
            title="Copy the prompt and open Codex"
          >
            <Monitor aria-hidden /> Codex
          </DropdownMenu.Item>
          <DropdownMenu.Item
            className="agent-handoff-item"
            onSelect={() => onLaunch("desktop")}
            title="Copy the prompt and open Claude Desktop"
          >
            <Monitor aria-hidden /> Claude Desktop
          </DropdownMenu.Item>
          <DropdownMenu.Item
            className="agent-handoff-item"
            onSelect={() => onLaunch("terminal")}
            title="Copy the prompt and run Claude CLI in Terminal"
          >
            <Terminal aria-hidden /> Claude Terminal
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
