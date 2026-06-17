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
  `/workflows.md` documents that are persisted in Firestore and rehydrated on every invocation, so a
  session is a single continuously‑refined model rather than a series of one‑off classifications.
- **Two‑speed cognition.** Passive monitoring is throttled, batched, and novelty‑gated so the agent
  doesn't loop on small things; interactive chat is unthrottled. Same agent, two cadences.
- **The chat is the real product.** Because the agent already holds a structured understanding,
  asking "which of these workflows should I automate?" produces grounded, specific answers — a
  preview of an assistant that knows your work before you ask.

## Key design decisions & tradeoffs

| Decision                                     | Why                                                                                      | Tradeoff                                                                                |
| -------------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Deep Agents (`deepagents`) for all reasoning | Planning + filesystem working memory + structured output fit an evolving model of intent | Heavier per call (big system prompt, more tokens) than a bare LLM call                  |
| Server‑side model calls (Cloud Functions)    | Keeps the Gemini key out of the distributed client; clean telemetry/reasoning boundary   | Requires the Blaze plan; adds latency vs. calling Gemini directly                       |
| Gemini 3.5 Flash, `thinkingLevel` per role   | Medium for monitoring/chat (responsive), high for the report (depth)                     | Image‑heavy monitoring calls are token‑expensive; mitigated by novelty dedup + batching |
| Full frame **and** 250×250 cursor crop       | Crop = precise focus point; full frame = app/section context                             | More tokens per observation; full frame is downscaled to compensate                     |
| Dwell at 300ms + dHash novelty filter        | Responsive capture without flooding the agent                                            | Native (client‑side) hashing complexity; tuned thresholds                               |
| All writes via Functions (Admin SDK)         | Tight, simple Firestore rules — clients only read what they own                          | Every mutation is a round‑trip through a callable                                       |
| Demo Mode with pre‑seeded observations       | Reviewers interact instantly in a browser with no screen permissions                     | Demo screenshots are placeholders; live capture is the desktop app                      |

## How we'd extend it with more time

- **Accessibility‑tree integration** for real UI‑element understanding instead of pixels.
- **Cross‑session memory** so Focus recognizes recurring projects and long‑horizon tasks.
- **Proactive, at‑the‑cursor suggestions** once confidence is high.
- **Closing the loop to actual automation** — turning a discovered, approved workflow into an
  executable action (with human‑in‑the‑loop interrupts).
- **Subagents** for dedicated workflow‑analysis vs. report‑writing, plus richer LangSmith evals.

## Approximate time spent

~1 focused build day: planning + interface design, the agent/Functions layer (incl. validating the
`deepagents` + Gemini 3.5 Flash integration), the React UI, the Electron capture path, demo mode, and
deployment/docs.

## ~5 minute video outline

1. **The idea (0:00–0:45)** — the theme flip: understanding your _own_ work from observation; dwell
   as the signal; understanding before automation.
2. **Live demo (0:45–2:30)** — load the demo session; walk the Agent Awareness panel (hypothesis,
   confidence, evidence, alternatives, workflows); scroll the timeline; show the live token usage.
3. **Chat (2:30–3:30)** — ask "what workflows did you notice?" and "which should I automate later?";
   show grounded, specific answers; generate the report.
4. **Under the hood (3:30–4:30)** — architecture diagram; Deep Agent + Gemini in Cloud Functions;
   the evolving `/hypothesis.md`; the two‑speed monitoring loop and novelty filter; LangSmith traces.
5. **Where it goes (4:30–5:00)** — accessibility tree, cross‑session memory, proactive assistance,
   closing the loop to real automation.
