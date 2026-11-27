import type { UsageAggregate } from "@focus/shared";

export function UsageBar({ usage }: { usage?: UsageAggregate }) {
  if (!usage || usage.callCount === 0) return null;
  return (
    <div className="usage" title="Model token usage this session">
      <span className="usage-item">
        <em>{fmt(usage.totalTokens)}</em> tokens
      </span>
      {usage.thinkingTokens > 0 && (
        <span className="usage-item">
          <em>{fmt(usage.thinkingTokens)}</em> thinking
        </span>
      )}
      <span className="usage-item">
        <em>{usage.callCount}</em> turns
      </span>
    </div>
  );
}

function fmt(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}
