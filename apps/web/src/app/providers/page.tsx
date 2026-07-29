import { EmptyState } from "@model-monitor/ui";

export default function ProvidersPage() {
  return (
    <div data-testid="providers-page">
      <h1
        style={{
          margin: 0,
          fontSize: "var(--text-page-size)",
          fontWeight: 600,
          lineHeight: "var(--text-page-line)",
          color: "var(--text)",
          fontFamily: "var(--font-sans)",
        }}
      >
        Providers & Plans
      </h1>
      <p
        style={{
          margin: "var(--space-1) 0 var(--space-6)",
          color: "var(--text-muted)",
          fontSize: "var(--text-meta-size)",
          fontFamily: "var(--font-sans)",
        }}
      >
        Access providers, plans, and commercial terms
      </p>
      <EmptyState
        title="Providers coming next"
        message="Provider and plan management will appear here in a later phase."
      />
    </div>
  );
}
