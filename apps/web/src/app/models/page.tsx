import { EmptyState } from "@model-monitor/ui";

export default function ModelsPage() {
  return (
    <div data-testid="models-page">
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
        Models
      </h1>
      <p
        style={{
          margin: "var(--space-1) 0 var(--space-6)",
          color: "var(--text-muted)",
          fontSize: "var(--text-meta-size)",
          fontFamily: "var(--font-sans)",
        }}
      >
        Browse and manage your model registry
      </p>
      <EmptyState
        title="Models table coming next"
        message="The models table, filters, and cards will land in the following phases."
      />
    </div>
  );
}
