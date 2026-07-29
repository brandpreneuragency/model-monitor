"use client";

import { useMemo, useState } from "react";
import {
  Button,
  Dialog,
  Input,
  ScoreCell,
  Select,
  StatusChip,
  Textarea,
} from "@model-monitor/ui";
import type { Confidence, LeaderboardEntryDto, SkillDto } from "./types";
import { confidenceColor, confidenceLabel, readApiError } from "./utils";

export type RatingDraft = {
  personalScore: number | null;
  personalConfidence: Confidence | null;
  notes: string | null;
  testedAt: string | null;
  tested: boolean;
  rankOverride: number | null;
  pinned: boolean;
  hidden: boolean;
};

const CONFIDENCE_OPTIONS = [
  { value: "", label: "— unset —" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

export function RatingActionsDialog({
  open,
  onClose,
  entry,
  skill,
  skills,
  onSaved,
  fetchImpl = fetch,
}: {
  open: boolean;
  onClose: () => void;
  entry: LeaderboardEntryDto;
  skill: SkillDto | null;
  skills: SkillDto[];
  onSaved?: () => void;
  fetchImpl?: typeof fetch;
}) {
  const defaultSkillId = skill?.id ?? entry.skillId ?? skills[0]?.id ?? "";
  const [skillId, setSkillId] = useState(defaultSkillId);
  const [score, setScore] = useState<string>(
    entry.personalScore != null ? String(entry.personalScore) : "",
  );
  const [confidence, setConfidence] = useState<string>(
    entry.personalConfidence ?? "",
  );
  const [notes, setNotes] = useState(entry.notes ?? "");
  const [testedAt, setTestedAt] = useState(entry.testedAt ?? "");
  const [rankOverride, setRankOverride] = useState(
    entry.rankOverride != null ? String(entry.rankOverride) : "",
  );
  const [pinned, setPinned] = useState(entry.pinned);
  const [hidden, setHidden] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const skillOptions = useMemo(
    () => skills.map((s) => ({ value: s.id, label: s.name })),
    [skills],
  );

  async function save(payload: Record<string, unknown>) {
    if (!skillId) {
      setError("Select a skill");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetchImpl(
        `/api/v1/models/${encodeURIComponent(entry.model.id)}/ratings/${encodeURIComponent(skillId)}`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      if (!res.ok) throw new Error(await readApiError(res));
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function parseScore(): number | null {
    if (score.trim() === "") return null;
    const n = Number(score);
    if (!Number.isFinite(n)) return null;
    return Math.min(10, Math.max(1, n));
  }

  function parseOverride(): number | null {
    if (rankOverride.trim() === "") return null;
    const n = Number(rankOverride);
    if (!Number.isFinite(n)) return null;
    return Math.trunc(n);
  }

  async function handleSave() {
    const personalScore = parseScore();
    await save({
      personalScore,
      personalConfidence: confidence
        ? (confidence)
        : null,
      notes: notes.trim() || null,
      testedAt: testedAt.trim() || null,
      tested: personalScore != null || Boolean(testedAt.trim()),
      rankOverride: parseOverride(),
      pinned,
      hidden,
    });
  }

  async function markUntested() {
    setScore("");
    setConfidence("");
    setTestedAt("");
    await save({
      personalScore: null,
      personalConfidence: null,
      tested: false,
      testedAt: null,
      notes: notes.trim() || null,
      rankOverride: parseOverride(),
      pinned,
      hidden,
    });
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Rate · ${entry.model.name}`}
      data-testid="rating-actions-dialog"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={() => void markUntested()} disabled={saving}>
            Mark untested
          </Button>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => void handleSave()}
            disabled={saving}
            data-testid="rating-actions-save"
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-3)",
        }}
      >
        {error ? (
          <p role="alert" style={{ color: "var(--danger)", margin: 0 }}>
            {error}
          </p>
        ) : null}
        {entry.externalScore != null ? (
          <p style={{ margin: 0, color: "var(--text-muted)", fontSize: "var(--text-meta-size)" }}>
            External score (read-only):{" "}
            <ScoreCell value={entry.externalScore} scale="hundred" label="External" />
          </p>
        ) : null}

        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ color: "var(--text-muted)", fontSize: "var(--text-meta-size)" }}>
            Skill
          </span>
          <Select
            options={skillOptions}
            value={skillId}
            onChange={setSkillId}
            data-testid="rating-skill"
          />
        </label>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "var(--space-3)",
          }}
        >
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ color: "var(--text-muted)", fontSize: "var(--text-meta-size)" }}>
              Score (1–10)
            </span>
            <Input
              type="number"
              min={1}
              max={10}
              step={0.5}
              value={score}
              onChange={(e) => setScore(e.target.value)}
              data-testid="rating-score"
            />
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ color: "var(--text-muted)", fontSize: "var(--text-meta-size)" }}>
              Confidence
            </span>
            <Select
              options={CONFIDENCE_OPTIONS}
              value={confidence}
              onChange={setConfidence}
              data-testid="rating-confidence"
            />
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ color: "var(--text-muted)", fontSize: "var(--text-meta-size)" }}>
              Test date
            </span>
            <Input
              type="date"
              value={testedAt}
              onChange={(e) => setTestedAt(e.target.value)}
              data-testid="rating-tested-at"
            />
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ color: "var(--text-muted)", fontSize: "var(--text-meta-size)" }}>
              Override rank order
            </span>
            <Input
              type="number"
              value={rankOverride}
              onChange={(e) => setRankOverride(e.target.value)}
              data-testid="rating-rank-override"
            />
          </label>
        </div>

        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ color: "var(--text-muted)", fontSize: "var(--text-meta-size)" }}>
            Testing notes
          </span>
          <Textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            data-testid="rating-notes"
          />
        </label>

        <div style={{ display: "flex", gap: "var(--space-4)", flexWrap: "wrap" }}>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={pinned}
              onChange={(e) => setPinned(e.target.checked)}
              data-testid="rating-pinned"
            />
            <span style={{ fontSize: "var(--text-meta-size)" }}>Pin as preferred</span>
          </label>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={hidden}
              onChange={(e) => setHidden(e.target.checked)}
              data-testid="rating-hidden"
            />
            <span style={{ fontSize: "var(--text-meta-size)" }}>Hide from this skill</span>
          </label>
        </div>
      </div>
    </Dialog>
  );
}

export function ConfidenceChip({ value }: { value: Confidence | null }) {
  if (!value) {
    return (
      <span style={{ color: "var(--text-faint)", fontSize: "var(--text-meta-size)" }}>—</span>
    );
  }
  const color = confidenceColor(value);
  return <StatusChip color={color} label={confidenceLabel(value)} />;
}
