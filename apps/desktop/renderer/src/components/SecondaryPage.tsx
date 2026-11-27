import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function SecondaryPage({
  title,
  count,
  className,
  headerClassName,
  contentClassName,
  backClassName,
  onBack,
  children,
}: {
  title: string;
  count?: number;
  className?: string;
  headerClassName?: string;
  contentClassName?: string;
  backClassName?: string;
  onBack: () => void;
  children: ReactNode;
}) {
  return (
    <main className={cx("secondary-page", className)}>
      <header className={cx("secondary-page-nav", headerClassName)}>
        <Button
          className={cx("secondary-page-back", backClassName)}
          variant="secondary"
          size="sm"
          aria-label="Back"
          onClick={onBack}
        >
          <ArrowLeft aria-hidden />
        </Button>
        <div className="secondary-page-title">
          <h1>{title}</h1>
        </div>
        {typeof count === "number" && (
          <Badge className="secondary-page-count" variant="secondary">
            {count}
          </Badge>
        )}
      </header>

      <div className={cx("secondary-page-content", contentClassName)}>{children}</div>
    </main>
  );
}
