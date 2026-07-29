"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, Card, Dialog, Input, Slider } from "@model-monitor/ui";
import type { ProfileDto, SkillDto } from "./types";
import { readApiError } from "./utils";

export function ProfilesPanel({
  profiles,
  skills,
  selectedId,
  onSelect,
  onProfilesChange,
  onWeightsLiveChange,
  fetchImpl = fetch,
}: {
  profiles: ProfileDto[];
  skills: SkillDto[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onProfilesChange: (profiles: ProfileDto[]) => void;
  /** Live weight map for selected profile — parent may re-rank without waiting for API. */
  onWeightsLiveChange?: (profileId: string, weights: Array<{ skillId: string; weight: number }>) => void;
  fetchImpl?: typeof fetch;
}) {
  const selected = profiles.find((p) => p.id === selectedId) ?? null;
  const [draftWeights, setDraftWeights] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selected) {
      setDraftWeights({});
      return;
    }
    const next: Record<string, number> = {};
    for (const s of skills) {
      const w = selected.weights.find((x) => x.skillId === s.id);
      next[s.id] = w?.weight ?? 0;
    }
    setDraftWeights(next);
  }, [selected, skills]);

  const weightList = useMemo(
    () =>
      skills.map((s) => ({
        skillId: s.id,
        weight: draftWeights[s.id] ?? 0,
      })),
    [skills, draftWeights],
  );

  function updateWeight(skillId: string, weight: number) {
    setDraftWeights((prev) => {
      const next = { ...prev, [skillId]: weight };
      if (selected) {
        const list = skills.map((s) => ({
          skillId: s.id,
          weight: s.id === skillId ? weight : (next[s.id] ?? 0),
        }));
        onWeightsLiveChange?.(selected.id, list);
      }
      return next;
    });
  }

  async function persistWeights() {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetchImpl(
        `/api/v1/ranking-profiles/${encodeURIComponent(selected.id)}/weights`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ weights: weightList.filter((w) => w.weight > 0) }),
        },
      );
      if (!res.ok) throw new Error(await readApiError(res));
      const updated = (await res.json()) as ProfileDto;
      onProfilesChange(
        profiles.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save weights");
    } finally {
      setSaving(false);
    }
  }

  async function createProfile() {
    const name = newName.trim();
    if (!name) {
      setError("Name is required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetchImpl("/api/v1/ranking-profiles", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error(await readApiError(res));
      const created = (await res.json()) as ProfileDto;
      onProfilesChange([...profiles, created]);
      onSelect(created.id);
      setNewOpen(false);
      setNewName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create profile");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card data-testid="ranking-profiles-panel" padding="md">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "var(--space-3)",
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: "var(--text-section-size)",
            fontWeight: 600,
          }}
        >
          Ranking Profiles
        </h2>
        <span style={{ color: "var(--text-muted)", fontSize: "var(--text-meta-size)" }}>
          {profiles.length} profiles
        </span>
      </div>

      <div data-testid="profiles-list">
        {profiles.map((p) => {
          const on = p.id === selectedId;
          const skillCount = p.weights.filter((w) => w.weight > 0).length;
          return (
            <button
              key={p.id}
              type="button"
              data-testid={`profile-${p.slug || p.id}`}
              data-selected={on || undefined}
              onClick={() => onSelect(p.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--space-2)",
                padding: "var(--space-2) var(--space-3)",
                borderRadius: "var(--radius-lg)",
                border: on
                  ? "1px solid var(--accent-border)"
                  : "1px solid transparent",
                background: on ? "var(--accent-bg)" : "transparent",
                marginBottom: "var(--space-2)",
                width: "100%",
                textAlign: "left",
                cursor: "pointer",
                color: "inherit",
                font: "inherit",
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "var(--radius-lg)",
                  background: "var(--bg-input)",
                  border: "1px solid var(--border)",
                  display: "grid",
                  placeItems: "center",
                  color: "var(--text-muted)",
                  flexShrink: 0,
                }}
              >
                ◈
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "var(--text-card-size)", fontWeight: 600 }}>
                  {p.name}
                  {p.isDefault ? (
                    <span style={{ color: "var(--warn)", marginLeft: 6 }}>★</span>
                  ) : null}
                </div>
                <div style={{ fontSize: 11, color: "var(--text-faint)" }}>
                  {p.isDefault ? "Default profile · " : ""}
                  {skillCount} skills
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <Button
        variant="secondary"
        style={{ width: "100%", marginTop: "var(--space-2)" }}
        data-testid="new-profile"
        onClick={() => setNewOpen(true)}
      >
        + New Profile
      </Button>

      {selected ? (
        <div
          data-testid="profile-weights-editor"
          style={{
            marginTop: "var(--space-4)",
            borderTop: "1px solid var(--border-subtle)",
            paddingTop: "var(--space-3)",
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-3)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <strong style={{ fontSize: "var(--text-meta-size)" }}>
              Weights · {selected.name}
            </strong>
            <Button
              variant="primary"
              size="sm"
              disabled={saving}
              onClick={() => void persistWeights()}
              data-testid="save-weights"
            >
              {saving ? "Saving…" : "Save weights"}
            </Button>
          </div>
          {skills.map((s) => (
            <Slider
              key={s.id}
              id={`weight-${s.id}`}
              label={s.name}
              min={0}
              max={10}
              step={0.5}
              value={draftWeights[s.id] ?? 0}
              onChange={(v) => updateWeight(s.id, v)}
              data-testid={`weight-slider-${s.slug || s.id}`}
            />
          ))}
        </div>
      ) : null}

      <div
        style={{
          background: "var(--bg-input)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "var(--radius-lg)",
          padding: "var(--space-3)",
          fontSize: "var(--text-meta-size)",
          color: "var(--text-muted)",
          marginTop: "var(--space-3)",
        }}
      >
        <strong style={{ color: "var(--advanced)" }}>Tip</strong>
        <br />
        Switch profiles to view how rankings change based on what matters most for
        your use case. Adjust weights to re-order the overall leaderboard live.
      </div>

      {error ? (
        <p role="alert" style={{ color: "var(--danger)", fontSize: "var(--text-meta-size)" }}>
          {error}
        </p>
      ) : null}

      <Dialog
        open={newOpen}
        onClose={() => {
          setNewOpen(false);
          setNewName("");
        }}
        title="New ranking profile"
        data-testid="new-profile-dialog"
        footer={
          <>
            <Button variant="secondary" onClick={() => setNewOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={saving}
              onClick={() => void createProfile()}
              data-testid="create-profile"
            >
              Create
            </Button>
          </>
        }
      >
        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ color: "var(--text-muted)", fontSize: "var(--text-meta-size)" }}>
            Name
          </span>
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            data-testid="new-profile-name"
            placeholder="e.g. Agent Routing"
          />
        </label>
      </Dialog>
    </Card>
  );
}
