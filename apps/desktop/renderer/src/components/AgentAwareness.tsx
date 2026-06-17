import { useState } from "react";
import { ChevronDown } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { directAddressText, type Observation, type Session } from "@focus/shared";
import { Card } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AccordionSection } from "./AccordionSection";

interface Props {
  session: Session;
  observations: Observation[];
}

export function AgentAwareness({ session, observations }: Props) {
  const [open, setOpen] = useState(false);
  const latest = observations[observations.length - 1];
  const currentIntent = directAddressText(session.currentIntent || "Building an understanding…");
  const hypothesis = directAddressText(session.agentFiles?.["/hypothesis.md"] ?? "");
  const currentIntentDetails = stripLeadingHeading(hypothesis, "Current Intent");
  const activity =
    session.agentActivity ||
    (session.updateInFlight ? "Agent is analyzing new activity." : latest?.summary || "");
  const activityText = directAddressText(activity);
  const suggestedNextAction = directAddressText(latest?.suggestedNextAction?.trim() ?? "");
  const hasDeepDetails =
    Boolean(hypothesis) ||
    Boolean(latest?.evidence?.length) ||
    Boolean(latest?.alternatives?.length);
  const hasDetails = Boolean(activity) || Boolean(suggestedNextAction) || hasDeepDetails;

  return (
    <Card className={`awareness gap-0 overflow-hidden py-0${open ? " is-open" : ""}`}>
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="panel-head awareness-head">
          <div className="awareness-pill">
            <span className="dot" data-conf={confLevel(session.confidence)} />
            <span className="pill-intent">{currentIntent}</span>
          </div>
        </div>

        {hasDetails && (
          <CollapsibleTrigger className="awareness-details-trigger">
            <span>View Details</span>
            <ChevronDown className="awareness-details-chevron" aria-hidden />
          </CollapsibleTrigger>
        )}

        <CollapsibleContent className="awareness-details-content">
          <div className="panel-body">
            {hasDetails && (
              <div className="awareness-accordion-group">
                {activity && (
                  <AccordionSection title="Current activity" variant="awareness">
                    <div
                      className={`agent-activity${session.updateInFlight ? " is-live" : ""}`}
                      aria-live="polite"
                    >
                      <span className="agent-activity-copy" key={activity}>
                        {activityText}
                      </span>
                    </div>
                  </AccordionSection>
                )}

                {hypothesis && (
                  <AccordionSection title="Current Intent" variant="awareness">
                    <div className="md-block">
                      <ReactMarkdown>{currentIntentDetails}</ReactMarkdown>
                    </div>
                  </AccordionSection>
                )}

                {latest?.evidence?.length ? (
                  <AccordionSection title="Supporting evidence" variant="awareness">
                    <ul>
                      {latest.evidence.map((e, i) => (
                        <li key={i}>{directAddressText(e)}</li>
                      ))}
                    </ul>
                  </AccordionSection>
                ) : null}

                {suggestedNextAction && (
                  <AccordionSection title="Anticipated next step" variant="awareness">
                    <p>{suggestedNextAction}</p>
                  </AccordionSection>
                )}

                {latest?.alternatives?.length ? (
                  <AccordionSection title="Alternative hypotheses" variant="awareness">
                    <ul>
                      {latest.alternatives.map((a, i) => (
                        <li key={i}>
                          <span>{directAddressText(a.hypothesis)}</span>
                          <span className="hypothesis-confidence">
                            {formatConfidence(a.confidence)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </AccordionSection>
                ) : null}
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

function stripLeadingHeading(markdown: string, heading: string): string {
  const lines = markdown.trim().split(/\r?\n/);
  const firstContentIndex = lines.findIndex((line) => line.trim().length > 0);
  if (firstContentIndex === -1) return markdown;

  const firstLine = lines[firstContentIndex].trim().replace(/^#{1,6}\s*/, "");
  if (firstLine.toLowerCase() !== heading.toLowerCase()) return markdown;

  return [...lines.slice(0, firstContentIndex), ...lines.slice(firstContentIndex + 1)]
    .join("\n")
    .trim();
}

function formatConfidence(confidence: number): string {
  if (!Number.isFinite(confidence)) return "";
  return `${Math.round(confidence * 100)}%`;
}

function confLevel(c: number): string {
  if (c >= 0.75) return "high";
  if (c >= 0.4) return "mid";
  return "low";
}
