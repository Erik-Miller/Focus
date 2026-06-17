import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { directAddressText, type Observation, type Session } from "@focus/shared";
import { Card } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

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
                  <AwarenessAccordionSection title="Current activity">
                    <div
                      className={`agent-activity${session.updateInFlight ? " is-live" : ""}`}
                      aria-live="polite"
                    >
                      <span className="agent-activity-copy" key={activity}>
                        {activityText}
                      </span>
                    </div>
                  </AwarenessAccordionSection>
                )}

                {hypothesis && (
                  <AwarenessAccordionSection title="Current Intent">
                    <div className="md-block">
                      <ReactMarkdown>{currentIntentDetails}</ReactMarkdown>
                    </div>
                  </AwarenessAccordionSection>
                )}

                {latest?.evidence?.length ? (
                  <AwarenessAccordionSection title="Supporting evidence">
                    <ul>
                      {latest.evidence.map((e, i) => (
                        <li key={i}>{directAddressText(e)}</li>
                      ))}
                    </ul>
                  </AwarenessAccordionSection>
                ) : null}

                {suggestedNextAction && (
                  <AwarenessAccordionSection title="Anticipated next step">
                    <p>{suggestedNextAction}</p>
                  </AwarenessAccordionSection>
                )}

                {latest?.alternatives?.length ? (
                  <AwarenessAccordionSection title="Alternative hypotheses">
                    <ul>
                      {latest.alternatives.map((a, i) => (
                        <li key={i}>
                          <span>{directAddressText(a.hypothesis)}</span>
                          <span className="hypothesis-confidence">{formatConfidence(a.confidence)}</span>
                        </li>
                      ))}
                    </ul>
                  </AwarenessAccordionSection>
                ) : null}
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

function AwarenessAccordionSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Collapsible className="awareness-accordion">
      <CollapsibleTrigger className="awareness-accordion-trigger">
        <span>{title}</span>
        <ChevronDown className="awareness-accordion-chevron" aria-hidden />
      </CollapsibleTrigger>
      <CollapsibleContent className="awareness-accordion-content">{children}</CollapsibleContent>
    </Collapsible>
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
