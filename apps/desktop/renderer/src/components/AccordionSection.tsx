import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

type AccordionSectionVariant = "awareness" | "report";

const classesByVariant: Record<
  AccordionSectionVariant,
  {
    root: string;
    trigger: string;
    chevron: string;
    content: string;
  }
> = {
  awareness: {
    root: "awareness-accordion",
    trigger: "awareness-accordion-trigger",
    chevron: "awareness-accordion-chevron",
    content: "awareness-accordion-content",
  },
  report: {
    root: "report-accordion",
    trigger: "report-accordion-trigger",
    chevron: "report-accordion-chevron",
    content: "report-accordion-content",
  },
};

export function AccordionSection({
  title,
  variant,
  children,
}: {
  title: string;
  variant: AccordionSectionVariant;
  children: ReactNode;
}) {
  const classes = classesByVariant[variant];

  return (
    <Collapsible className={classes.root}>
      <CollapsibleTrigger className={classes.trigger}>
        <span>{title}</span>
        <ChevronDown className={classes.chevron} aria-hidden />
      </CollapsibleTrigger>
      <CollapsibleContent className={classes.content}>{children}</CollapsibleContent>
    </Collapsible>
  );
}
