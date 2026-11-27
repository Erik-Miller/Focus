# Focus — Design Rationale

## Theme: Exploration & Understanding

Most tools in this theme help people understand _external_ artifacts — codebases, datasets,
documents. Focus turns the lens around: can an agent help you understand **your own work**, inferred
purely from observation rather than from you explaining yourself?

That reframing is the whole point. Instead of asking "what are you doing?", Focus watches moments of
attention and tries to answer it on your behalf, then shows its reasoning so you can correct it.

## Why this specific approach

- **Dwell as the signal.** Continuous activity streams are noisy. The moments where a user _pauses_
  are disproportionately meaningful — that's where attention actually lands. Using dwell as the unit
  of observation gives a lightweight, high‑signal sensor instead of a firehose.
- **Understand before acting.** Most "computer use" work races toward automation. Focus deliberately
  stops at understanding: it can _propose_ what to automate, but it never acts. Building a faithful
  model of intent is the prerequisite that everyone skips.
- **The agent's understanding is the UI.** The Agent Awareness panel — hypothesis, confidence,
  evidence, alternatives — is the primary surface. Screenshots and the timeline are demoted to
  _supporting evidence_ for the agent's conclusions. Traditional trackers tell you _what_ happened;
  Focus tries to explain _why_.

## What's interesting / non‑obvious

- **An evolving, filesystem‑backed understanding.** The agent maintains living `/hypothesis.md` and
  `/workflows.md` documents that are persisted in local SQLite and rehydrated on every invocation, so a
  session is a single continuously‑refined model rather than a series of one‑off classifications.
- **Two‑speed cognition.** Passive monitoring is throttled, batched, and novelty‑gated so the agent
  doesn't loop on small things; interactive chat is unthrottled. Same agent, two cadences.
- **The chat is the real product.** Because the agent already holds a structured understanding,
  asking "which of these workflows should I automate?" produces grounded, specific answers — a
  preview of an assistant that knows your work before you ask.

## Key design decisions & tradeoffs

| Decision                                     | Why                                                                                      | Tradeoff                                                                           |
| -------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Deep Agents (`deepagents`) for all reasoning | Planning + filesystem working memory + structured output fit an evolving model of intent | Heavier per call (big system prompt, more tokens) than a bare LLM call             |
| Local model calls in Electron                | No hosted backend; user controls their provider key                                      | AI calls still need provider network access and quota                              |
| User-selected model provider                 | OpenAI, Anthropic, and Gemini keys in local secure storage                               | Provider integrations share the same agent contracts                               |
| 250×250 cursor crop + periodic full frame    | Crop = precise focus point; full frame = occasional app/section context                  | Less context on most observations; full frames stay downscaled and cadence-limited |
| Dwell at 300ms + dHash novelty filter        | Responsive capture without flooding the agent                                            | Native (client‑side) hashing complexity; tuned thresholds                          |
| Local SQLite writes via Electron IPC         | Session data stays on the Mac; serialized transactions                                   | Local backups are the user’s responsibility                                        |

## How we'd extend it with more time

- **Accessibility‑tree integration** for real UI‑element understanding instead of pixels.
- **Cross‑session memory** so Focus recognizes recurring projects and long‑horizon tasks.
- **Proactive, at‑the‑cursor suggestions** once confidence is high.
- **Closing the loop to actual automation** — turning a discovered, approved workflow into an
  executable action (with human‑in‑the‑loop interrupts).
- **Subagents** for dedicated workflow‑analysis vs. report‑writing, plus richer offline evaluations.
