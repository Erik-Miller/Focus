import ReactMarkdown from "react-markdown";
import { ChevronRight } from "lucide-react";
import { directAddressReport, type Observation, type Report } from "@focus/shared";
import { Card } from "@/components/ui/card";
import { WorkflowCard } from "./WorkflowCard";

export function ReportView({
  observations,
  report,
}: {
  observations: Observation[];
  report: Report;
}) {
  const viewReport = directAddressReport(report);
  const timelineMarkdown = localizeTimelineMarkdown(viewReport.timelineMarkdown, observations);
  const automationCandidates =
    viewReport.workflows?.length > 0 ? (
      <div className="workflows report-top-workflows">
        {viewReport.workflows.map((w, i) => (
          <WorkflowCard
            key={`${w.name}-report-${i}`}
            workflow={w}
            context={{
              label: "Focus generated this report objective",
              value: viewReport.objective,
              fallback: "(No report objective captured.)",
            }}
            source={{
              sessionId: viewReport.sessionId,
              reportId: viewReport.id,
              title: viewReport.objective || "Session report",
            }}
            spotlight={w.automatable}
          />
        ))}
      </div>
    ) : null;

  return (
    <Card className="report gap-0 overflow-hidden py-0">
      <div className="report-body">
        {automationCandidates}

        {viewReport.focusAreas?.length > 0 && (
          <div className="report-focus-areas">
            <div className="report-section-label">Focus areas</div>
            <div className="report-focus-pill-row">
              {viewReport.focusAreas.map((f, i) => (
                <span className="report-focus-pill" key={`${f}-${i}`}>
                  {f}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="md-block report-narrative">
          <ReactMarkdown>{formatReportNarrative(viewReport.narrative)}</ReactMarkdown>
        </div>

        {timelineMarkdown && (
          <details className="report-section" open>
            <summary>
              <ChevronRight className="summary-chevron" aria-hidden />
              <span>Timeline</span>
            </summary>
            <div className="md-block">
              <ReactMarkdown>{timelineMarkdown}</ReactMarkdown>
            </div>
          </details>
        )}

        {viewReport.interpretations && (
          <details className="report-section" open>
            <summary>
              <ChevronRight className="summary-chevron" aria-hidden />
              <span>Interpretation</span>
            </summary>
            <div className="md-block">
              <ReactMarkdown>{viewReport.interpretations}</ReactMarkdown>
            </div>
          </details>
        )}

        {viewReport.nextSteps?.length > 0 && (
          <details className="report-section" open>
            <summary>
              <ChevronRight className="summary-chevron" aria-hidden />
              <span>Suggested next steps</span>
            </summary>
            <ul>
              {viewReport.nextSteps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </Card>
  );
}

function formatReportNarrative(markdown: string): string {
  const lines = markdown.trim().split(/\r?\n/);
  const firstContentIndex = lines.findIndex((line) => line.trim().length > 0);
  if (firstContentIndex === -1) return markdown;

  const firstLine = lines[firstContentIndex].trim();
  if (/^#{1,6}\s/.test(firstLine)) return markdown;

  if (/^(Field Report|Session Report|Report):/i.test(firstLine)) {
    return [
      ...lines.slice(0, firstContentIndex),
      `### ${firstLine}`,
      "",
      ...lines.slice(firstContentIndex + 1),
    ]
      .join("\n")
      .trim();
  }

  return markdown;
}

function localizeTimelineMarkdown(markdown: string, observations: Observation[]): string {
  if (!markdown || observations.length === 0) return markdown;
  const byId = new Map(observations.map((observation) => [observation.id, observation]));
  return markdown
    .split(/\r?\n/)
    .map((line) => localizeTimelineLine(line, byId))
    .join("\n");
}

function localizeTimelineLine(line: string, observations: Map<string, Observation>): string {
  const observation = findObservationForLine(line, observations);
  if (!observation) return line;
  const localTime = new Date(observation.timestamp).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  const leadingTimePattern =
    /^(\s*(?:[-*]\s*)?)(?:[A-Z][a-z]{2}\s+\d{1,2},\s+)?\d{1,2}:\d{2}(?:\s?[AP]M)?(?=\s*\|)/i;
  if (leadingTimePattern.test(line)) {
    return line.replace(leadingTimePattern, `$1${localTime}`);
  }

  return line;
}

function findObservationForLine(
  line: string,
  observations: Map<string, Observation>,
): Observation | null {
  for (const [id, observation] of observations) {
    if (line.includes(id)) return observation;
  }
  return null;
}
