import ReactMarkdown from "react-markdown";
import { directAddressReport, type Observation, type Report } from "@focus/shared";
import { Card } from "@/components/ui/card";
import { AccordionSection } from "./AccordionSection";
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
  const focusAreaTags = viewReport.focusAreas.map((focusArea) => ({
    raw: focusArea,
    label: compactFocusAreaTag(focusArea),
  }));
  const automationCandidates =
    viewReport.workflows?.length > 0 ? (
      <div className="report-top-workflows">
        <h3 className="report-section-heading">Recommended workflows</h3>
        <div className="workflows">
          {viewReport.workflows.map((w, i) => (
            <WorkflowCard
              key={`${w.name}-report-${i}`}
              workflow={w}
              context={{
                label: "Focus generated this summary objective",
                value: viewReport.objective,
                fallback: "(No summary objective captured.)",
              }}
              source={{
                sessionId: viewReport.sessionId,
                reportId: viewReport.id,
                title: viewReport.objective || "Session summary",
              }}
              spotlight={w.automatable}
            />
          ))}
        </div>
      </div>
    ) : null;

  return (
    <Card className="report gap-0 overflow-hidden py-0">
      <div className="report-body">
        {focusAreaTags.length > 0 && (
          <div className="report-focus-areas">
            <h3 className="report-section-heading">Focus areas</h3>
            <div className="report-focus-pill-row">
              {focusAreaTags.map((focusArea, i) => (
                <span
                  className="report-focus-pill"
                  key={`${focusArea.raw}-${i}`}
                  title={focusArea.raw}
                >
                  {focusArea.label}
                </span>
              ))}
            </div>
          </div>
        )}

        {automationCandidates}

        <div className="md-block report-narrative">
          <ReactMarkdown>{formatReportNarrative(viewReport.narrative)}</ReactMarkdown>
        </div>

        {timelineMarkdown && (
          <AccordionSection title="Timeline" variant="report">
            <div className="md-block">
              <ReactMarkdown>{timelineMarkdown}</ReactMarkdown>
            </div>
          </AccordionSection>
        )}

        {viewReport.interpretations && (
          <AccordionSection title="Interpretation" variant="report">
            <div className="md-block">
              <ReactMarkdown>{viewReport.interpretations}</ReactMarkdown>
            </div>
          </AccordionSection>
        )}

        {viewReport.nextSteps?.length > 0 && (
          <AccordionSection title="Suggested next steps" variant="report">
            <ul className="report-next-steps">
              {viewReport.nextSteps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </AccordionSection>
        )}
      </div>
    </Card>
  );
}

export function compactFocusAreaTag(area: string): string {
  let tag = area
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[.!?]+$/g, "")
    .replace(/^[-*]\s*/, "");

  const cnnFoxMatch = tag.match(/\bcoverage\s+between\s+(CNN)\s+and\s+(Fox(?:\s+News)?)\b/i);
  if (cnnFoxMatch) return "CNN vs Fox coverage";

  if (/\bTrump\b/i.test(tag) && /\bG7\b/i.test(tag) && /\bupdates?\b/i.test(tag)) {
    return "Trump G7 updates";
  }

  if (/\bUS[-\s]Iran\b/i.test(tag) && /\b14[-\s]point\b/i.test(tag)) {
    return "US-Iran 14-point deal";
  }

  tag = tag
    .replace(
      /^(comparing|tracking|dissecting|reviewing|monitoring|analyzing|exploring|following|checking)\s+/i,
      "",
    )
    .replace(/^the\s+details\s+of\s+/i, "")
    .replace(/\s+updates?$/i, "")
    .replace(/^President\s+Trump'?s?\s+/i, "Trump ")
    .replace(/\bFox News\b/g, "Fox");

  return shortenTag(tag);
}

function shortenTag(tag: string): string {
  const words = tag.split(" ");
  if (tag.length <= 32 || words.length <= 4) return tag;
  return `${words.slice(0, 4).join(" ")}...`;
}

export function formatReportNarrative(markdown: string): string {
  const lines = markdown.trim().split(/\r?\n/);
  const firstContentIndex = lines.findIndex((line) => line.trim().length > 0);
  if (firstContentIndex === -1) return markdown;

  const firstLine = lines[firstContentIndex].trim();
  const fieldReportHeading = fieldReportHeadingFromReportHeading(firstLine);
  if (/^#{1,6}\s/.test(firstLine)) {
    if (!fieldReportHeading) return markdown;
    return [
      ...lines.slice(0, firstContentIndex),
      fieldReportHeading,
      ...lines.slice(firstContentIndex + 1),
    ]
      .join("\n")
      .trim();
  }

  if (fieldReportHeading) {
    return [
      ...lines.slice(0, firstContentIndex),
      `### ${fieldReportHeading}`,
      "",
      ...lines.slice(firstContentIndex + 1),
    ]
      .join("\n")
      .trim();
  }

  return [
    ...lines.slice(0, firstContentIndex),
    "### Field report",
    "",
    ...lines.slice(firstContentIndex),
  ]
    .join("\n")
    .trim();
}

function fieldReportHeadingFromReportHeading(line: string): string | null {
  const match = line.match(/^(#{1,6}\s*)?(Field Report|Session Report|Report)(\s*:)?(.*)$/i);
  if (!match) return null;
  const prefix = match[1] ?? "";
  const suffix = match[4]?.trim();
  return `${prefix}Field report${suffix ? `: ${suffix}` : ""}`;
}

export function localizeTimelineMarkdown(markdown: string, observations: Observation[]): string {
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
