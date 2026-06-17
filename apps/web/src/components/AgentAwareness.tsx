import { useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import ReactMarkdown from "react-markdown";
import {
  directAddressText,
  directAddressWorkflow,
  type Observation,
  type Session,
} from "@focus/shared";
import { Card } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { WorkflowCard } from "./WorkflowCard";

interface Props {
  session: Session;
  observations: Observation[];
  reportSummary?: ReactNode;
}

export function AgentAwareness({ session, observations, reportSummary }: Props) {
  const [open, setOpen] = useState(true);
  const latest = observations[observations.length - 1];
  const confidencePct = Math.round((session.confidence ?? 0) * 100);
  const currentIntent = directAddressText(session.currentIntent || "Building an understanding…");
  const hypothesis = directAddressText(session.agentFiles?.["/hypothesis.md"] ?? "");
  const workflows = (session.discoveredWorkflows ?? []).map(directAddressWorkflow);
  const workflowsWithSteps = workflows.filter((w) => Boolean(w.stepsObserved?.length));
  const activity =
    session.agentActivity ||
    (session.updateInFlight ? "Agent is analyzing new activity." : latest?.summary || "");
  const activityText = directAddressText(activity);
  const suggestedNextAction = directAddressText(latest?.suggestedNextAction?.trim() ?? "");
  const hasDeepDetails =
    Boolean(hypothesis) ||
    Boolean(latest?.evidence?.length) ||
    Boolean(latest?.alternatives?.length) ||
    Boolean(workflowsWithSteps.length);
  const hasDetails =
    Boolean(activity) || Boolean(suggestedNextAction) || Boolean(workflows.length) || hasDeepDetails;

  return (
    <Card className={`awareness gap-0 overflow-hidden py-0${open ? " is-open" : ""}`}>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="panel-head">
          <div className="awareness-pill">
            <span className="dot" data-conf={confLevel(session.confidence)} />
            <span className="pill-intent">{currentIntent}</span>
            <span className="pill-conf">{confidencePct}%</span>
          </div>
          <span className={`chevron${open ? " is-open" : ""}`} aria-hidden>
            <ChevronRight />
          </span>
        </CollapsibleTrigger>

        {reportSummary && <div className="awareness-report">{reportSummary}</div>}

        <CollapsibleContent>
          <div className="panel-body">
            {hasDetails && (
              <details className="details-section subsection" open>
                <summary>
                  <ChevronRight className="summary-chevron" aria-hidden />
                  <span>Details</span>
                </summary>

                {activity && (
                  <div
                    className={`agent-activity${session.updateInFlight ? " is-live" : ""}`}
                    aria-live="polite"
                  >
                    <span className="agent-activity-copy" key={activity}>
                      {activityText}
                    </span>
                  </div>
                )}

                {suggestedNextAction && (
                  <div className="subsection">
                    <h4>Suggested next step</h4>
                    <p>{suggestedNextAction}</p>
                  </div>
                )}

                {workflows.length ? (
                  <div className="subsection">
                    <h4>Workflows</h4>
                    <div className="workflows">
                      {workflows.map((w, i) => (
                        <div className="workflow-detail" key={`${w.name}-promoted-${i}`}>
                          <WorkflowCard
                            workflow={w}
                            context={{
                              label: "Focus observed this session intent",
                              value: currentIntent,
                              fallback: "(No session intent captured.)",
                            }}
                            source={{
                              sessionId: session.id,
                              title: currentIntent || session.title || "Untitled session",
                            }}
                            spotlight={w.automatable}
                          />
                          {w.frequency && (
                            <p className="muted">{formatWorkflowFrequency(w.frequency)}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {hasDeepDetails && (
                  <div className="analysis-section">
                    {hypothesis && (
                      <div className="md-block">
                        <ReactMarkdown>{hypothesis}</ReactMarkdown>
                      </div>
                    )}

                    {latest?.evidence?.length ? (
                      <div className="analysis-section">
                        <h5>Supporting evidence</h5>
                        <ul>
                          {latest.evidence.map((e, i) => (
                            <li key={i}>{directAddressText(e)}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    {latest?.alternatives?.length ? (
                      <div className="analysis-section">
                        <h5>Alternative hypotheses</h5>
                        <ul>
                          {latest.alternatives.map((a, i) => (
                            <li key={i}>
                              {directAddressText(a.hypothesis)}{" "}
                              <span className="muted">({Math.round(a.confidence * 100)}%)</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    {workflowsWithSteps.length ? (
                      <div className="analysis-section">
                        <h5>Workflow steps</h5>
                        <div className="workflows">
                          {workflowsWithSteps.map((w, i) => (
                            <div className="workflow-detail" key={`${w.name}-steps-${i}`}>
                              <h5>{w.name}</h5>
                              <ol>
                                {w.stepsObserved!.map((step, stepIndex) => (
                                  <li key={stepIndex}>{step}</li>
                                ))}
                              </ol>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                )}
              </details>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

function confLevel(c: number): string {
  if (c >= 0.75) return "high";
  if (c >= 0.4) return "mid";
  return "low";
}

function formatWorkflowFrequency(frequency: string): string {
  const value = frequency.trim();
  if (!value) return "";
  if (value.toLowerCase() === "once") return "Observed once";
  return `Observed ${value}`;
}
