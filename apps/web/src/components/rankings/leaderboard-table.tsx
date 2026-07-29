"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { Button, EmptyState, ScoreCell } from "@model-monitor/ui";
import type {
  LeaderboardEntryDto,
  ModelEnrichment,
  RankingType,
  SkillDto,
} from "./types";
import { ConfidenceChip, RatingActionsDialog } from "./rating-actions";
import { LogoTile, displayExternal, displayPersonal, faintText, mutedText } from "./utils";

const PAGE_SIZE = 10;

function RankBadge({ rank }: { rank: number }) {
  if (rank <= 3) {
    const tone =
      rank === 1 ? "g" : rank === 2 ? "s" : "b";
    return (
      <span
        className={`mm-medal mm-medal-${tone}`}
        data-testid={`rank-medal-${rank}`}
        style={{
          width: 24,
          height: 24,
          borderRadius: "var(--radius-full)",
          display: "inline-grid",
          placeItems: "center",
          fontSize: 11,
          fontWeight: 700,
          background: rank === 2 ? "var(--neutral-bg)" : "var(--warn-bg)",
          color: rank === 2 ? "var(--text-muted)" : "var(--warn)",
          opacity: rank === 3 ? 0.85 : 1,
        }}
      >
        {rank}
      </span>
    );
  }
  return (
    <span
      style={{
        width: 24,
        textAlign: "center",
        color: "var(--text-muted)",
        fontVariantNumeric: "tabular-nums",
        display: "inline-block",
      }}
    >
      {rank}
    </span>
  );
}

export function LeaderboardTable({
  entries,
  type,
  skill,
  skills,
  modelsById,
  onRateRequest,
  onRated,
  fetchImpl = fetch,
}: {
  entries: LeaderboardEntryDto[];
  type: RankingType;
  skill: SkillDto | null;
  skills: SkillDto[];
  modelsById: Map<string, ModelEnrichment>;
  onRateRequest?: () => void;
  onRated?: () => void;
  fetchImpl?: typeof fetch;
}) {
  const [page, setPage] = useState(0);
  const [ratingEntry, setRatingEntry] = useState<LeaderboardEntryDto | null>(null);

  const showPersonal = type === "personal" || type === "combined";
  const showExternal = type === "external" || type === "combined";

  const personalEmpty =
    type === "personal" &&
    entries.length > 0 &&
    entries.every((e) => e.personalScore == null && e.overallScore == null);

  const total = entries.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const slice = useMemo(() => {
    const start = safePage * PAGE_SIZE;
    return entries.slice(start, start + PAGE_SIZE);
  }, [entries, safePage]);

  if (personalEmpty) {
    return (
      <div data-testid="leaderboard-personal-empty">
        <EmptyState
          title="No personal rankings yet"
          message="You have not scored any models for this skill. Personal scores stay separate from external research scores."
          action={
            <Button
              variant="primary"
              data-testid="empty-rate-model"
              onClick={() => {
                if (entries[0]) setRatingEntry(entries[0]);
                else onRateRequest?.();
              }}
            >
              Rate a model
            </Button>
          }
        />
        {ratingEntry ? (
          <RatingActionsDialog
            open
            onClose={() => setRatingEntry(null)}
            entry={ratingEntry}
            skill={skill}
            skills={skills}
            onSaved={onRated}
            fetchImpl={fetchImpl}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div data-testid="leaderboard-table" style={{ overflowX: "auto" }}>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: "var(--text-body-size)",
          fontFamily: "var(--font-sans)",
        }}
      >
        <thead>
          <tr>
            {[
              "Rank",
              "Model",
              ...(showPersonal ? ["Personal Score"] : []),
              ...(showExternal ? ["External Score"] : []),
              "Confidence",
              "Creator",
              "Access Provider",
              "Plan",
              "Cost",
              "Best Use",
              "Notes",
            ].map((h) => (
              <th
                key={h}
                style={{
                  textAlign: "left",
                  color: "var(--text-muted)",
                  fontWeight: 500,
                  fontSize: "var(--text-meta-size)",
                  padding: "var(--space-2)",
                  borderBottom: "1px solid var(--border)",
                  whiteSpace: "nowrap",
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {slice.map((entry) => {
            const enrich = modelsById.get(entry.model.id);
            const personal = displayPersonal(entry);
            const external = displayExternal(entry);
            const creator =
              entry.model.creator?.name ?? enrich?.creatorName ?? "—";
            const provider = enrich?.accessProviderName ?? "—";
            const plan = enrich?.planName ?? "—";
            const cost = enrich?.costOrQuota ?? "—";
            const bestUse = enrich?.bestUse ?? "—";

            return (
              <tr
                key={entry.model.id}
                data-testid={`leaderboard-row-${entry.model.id}`}
                data-rank={entry.rank}
                data-pinned={entry.pinned || undefined}
              >
                <td style={tdStyle}>
                  <RankBadge rank={entry.rank} />
                  {entry.pinned ? (
                    <span
                      title="Pinned"
                      style={{ marginLeft: 4, color: "var(--warn)", fontSize: 11 }}
                    >
                      ★
                    </span>
                  ) : null}
                </td>
                <td style={tdStyle}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <LogoTile label={entry.model.name} />
                    <span style={{ fontWeight: 500 }}>{entry.model.name}</span>
                  </div>
                </td>
                {showPersonal ? (
                  <td style={tdStyle}>
                    <button
                      type="button"
                      onClick={() => setRatingEntry(entry)}
                      data-testid={`rate-personal-${entry.model.id}`}
                      style={{
                        appearance: "none",
                        border: "none",
                        background: "transparent",
                        padding: 0,
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                      title="Edit personal rating"
                    >
                      <ScoreCell
                        value={personal}
                        scale="ten"
                        label="Personal"
                      />
                      <span style={{ color: "var(--text-faint)", fontSize: 11 }}>✎</span>
                    </button>
                  </td>
                ) : null}
                {showExternal ? (
                  <td style={tdStyle}>
                    <ScoreCell
                      value={external}
                      scale="auto"
                      label="External"
                    />
                  </td>
                ) : null}
                <td style={tdStyle}>
                  <ConfidenceChip value={entry.personalConfidence} />
                </td>
                <td style={{ ...tdStyle, ...mutedText }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <LogoTile label={creator} />
                    {creator}
                  </div>
                </td>
                <td style={{ ...tdStyle, ...mutedText }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <LogoTile label={provider} />
                    {provider}
                  </div>
                </td>
                <td style={{ ...tdStyle, ...mutedText }}>{plan}</td>
                <td style={{ ...tdStyle, ...mutedText }}>{cost}</td>
                <td style={{ ...tdStyle, ...mutedText }}>{bestUse}</td>
                <td style={{ ...tdStyle, ...faintText, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis" }}>
                  {entry.notes ?? "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--space-3)",
          paddingTop: "var(--space-3)",
          fontSize: "var(--text-meta-size)",
          color: "var(--text-muted)",
        }}
      >
        <span>
          Showing {total === 0 ? 0 : safePage * PAGE_SIZE + 1} to{" "}
          {Math.min((safePage + 1) * PAGE_SIZE, total)} of {total} models
        </span>
        <div style={{ display: "flex", gap: 4 }} data-testid="leaderboard-pager">
          <Button
            variant="ghost"
            size="sm"
            disabled={safePage <= 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            aria-label="Previous page"
          >
            ‹
          </Button>
          <span
            style={{
              minWidth: 28,
              height: 28,
              display: "grid",
              placeItems: "center",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border)",
              background: "var(--bg-input)",
              color: "var(--text)",
            }}
          >
            {safePage + 1}
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={safePage >= pageCount - 1}
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            aria-label="Next page"
          >
            ›
          </Button>
        </div>
      </div>

      {ratingEntry ? (
        <RatingActionsDialog
          open
          onClose={() => setRatingEntry(null)}
          entry={ratingEntry}
          skill={skill}
          skills={skills}
          onSaved={onRated}
          fetchImpl={fetchImpl}
        />
      ) : null}
    </div>
  );
}

const tdStyle: CSSProperties = {
  padding: "0 var(--space-2)",
  height: "var(--row-standard)",
  borderBottom: "1px solid var(--border-subtle)",
  whiteSpace: "nowrap",
  verticalAlign: "middle",
};
