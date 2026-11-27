import { expect, test } from "@playwright/test";

test("mocked monitoring flow captures, stops, opens report, and cancels chat", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Start monitoring" }).click();
  await page.getByRole("button", { name: "Emit dwell" }).click();

  await expect(page.getByText(/Analyzing activity|Captured activity/)).toBeVisible();

  await page.getByRole("button", { name: "Stop" }).click();
  await page.getByRole("button", { name: "View Report" }).click();

  await expect(page.getByText("Mocked capture flow")).toBeVisible();
  await expect(page.getByText(/You ran the deterministic Focus harness/)).toBeVisible();

  await page.getByPlaceholder("Message...").fill("slow question");
  await page.getByRole("button", { name: "Send" }).click();
  const chatForm = page.locator(".chat-input");
  await expect(chatForm.getByRole("button", { name: "Stop" })).toBeVisible();
  await expect(page.getByText("Thinking")).toBeVisible();
  await chatForm.getByRole("button", { name: "Stop" }).dispatchEvent("click");
  await expect(chatForm.getByRole("button", { name: "Send" })).toBeVisible();
  await expect(page.getByPlaceholder("Message...")).toBeEnabled();
});

test("mocked workflow flow saves to inbox and opens Codex and Claude handoffs", async ({
  page,
}) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Start monitoring" }).click();
  await page.getByRole("button", { name: "Emit dwell" }).click();
  await page.getByRole("button", { name: "Stop" }).click();

  await page.getByRole("button", { name: /Save workflow/i }).click();
  await expect(page.getByRole("button", { name: /Workflow Inbox 1/i })).toBeVisible();

  await page.getByRole("button", { name: "Saved workflows (1)" }).click();
  await expect(
    page.locator(".saved-workflow-title strong", { hasText: "Compare links" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Copy for agent" }).click();
  await page.getByRole("menuitem", { name: "Codex", exact: true }).click();
  await expect(page.locator("body")).toHaveAttribute("data-last-automation-target", "codex");
  await page.getByRole("button", { name: "Copy for agent" }).click();
  await page.getByRole("menuitem", { name: "Claude Desktop", exact: true }).click();
  await expect(page.locator("body")).toHaveAttribute("data-last-automation-target", "desktop");
  await page.getByRole("button", { name: "Copy for agent" }).click();
  await page.getByRole("menuitem", { name: "Claude Terminal", exact: true }).click();
  await expect(page.locator("body")).toHaveAttribute("data-last-automation-target", "terminal");
  await expect(page.getByRole("menu")).toHaveCount(0);
});
