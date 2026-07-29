import { EmptyState } from "@model-monitor/ui";

export default function RankingsPage() {
  return (
    <div data-testid="rankings-page">
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
        Rankings
      </h1>
      <p
        style={{
          margin: "var(--space-1) 0 var(--space-6)",
          color: "var(--text-muted)",
          fontSize: "var(--text-meta-size)",
          fontFamily: "var(--font-sans)",
        }}
      >
        Personal and external skill leaderboards
      </p>
      <EmptyState
        title="Rankings coming next"
        message="Leaderboards and ranking profiles will appear here in a later phase."
      />
    </div>
  );
}
