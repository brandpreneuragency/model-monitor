"use client";

import type { CSSProperties } from "react";
import type { DrawerModel } from "./types";

const grid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "140px 1fr",
  gap: "var(--space-2) var(--space-3)",
  fontSize: "var(--text-meta-size)",
};

const label: CSSProperties = { color: "var(--text-muted)" };
const value: CSSProperties = { color: "var(--text)" };

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <>
      <div style={label}>{k}</div>
      <div style={value}>{v ?? "—"}</div>
    </>
  );
}

function yesNoUnknown(v: boolean | null | undefined): string {
  if (v === true) return "Yes";
  if (v === false) return "No";
  return "Unknown";
}

function formatTokens(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString();
}

export function SpecificationsTab({ model }: { model: DrawerModel }) {
  const caps = model.capabilities;
  const context = model.contextTokens ?? model.context ?? null;
  const speed = model.speedRating ?? model.speed ?? null;

  return (
    <div data-testid="drawer-tab-specifications" style={grid}>
      <Row k="Family" v={model.family ?? "—"} />
      <Row k="Generation" v={model.generation ?? "—"} />
      <Row k="Release" v={model.releaseDate ?? "—"} />
      <Row k="Knowledge cutoff" v={model.knowledgeCutoff ?? "—"} />
      <Row k="Context" v={formatTokens(context)} />
      <Row k="Maximum output" v={formatTokens(model.maxOutputTokens ?? null)} />
      <Row k="Speed" v={speed ?? "—"} />
      <Row k="Vision" v={yesNoUnknown(caps?.vision)} />
      <Row k="Reasoning" v={yesNoUnknown(caps?.reasoning)} />
      <Row k="Tool support" v={yesNoUnknown(caps?.toolUse)} />
      <Row k="Agent support" v={yesNoUnknown(caps?.parallelAgents)} />
      <Row k="Computer use" v={yesNoUnknown(caps?.computerUse)} />
      <Row k="Function calling" v={yesNoUnknown(caps?.functionCalling)} />
      <Row k="Model type" v={model.modelType ?? "—"} />
      <Row
        k="Coding specialization"
        v={model.codingSpecialization ?? "—"}
      />
      <Row k="Lifecycle" v={model.lifecycle ?? "—"} />
      <Row
        k="Verification"
        v={model.verificationStatus ?? "—"}
      />
    </div>
  );
}
