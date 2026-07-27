"use client";

import { useMemo, useState, type CSSProperties } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import "@model-monitor/ui/tokens.css";
import {
  Badge,
  Button,
  Card,
  Combobox,
  DataTable,
  Dialog,
  Drawer,
  EmptyState,
  FilterChip,
  IconButton,
  Input,
  Panel,
  Popover,
  ProgressBar,
  ScoreCell,
  SegmentedControl,
  Select,
  Skeleton,
  Slider,
  Sparkline,
  StatusChip,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Tag,
  Textarea,
  Toggle,
} from "@model-monitor/ui";

/* Dev gallery — every primitive in representative states. Not linked from nav. */

type DemoRow = { id: string; name: string; score: number | null };

const demoColumns: ColumnDef<DemoRow, unknown>[] = [
  { accessorKey: "name", header: "Name" },
  {
    accessorKey: "score",
    header: "Score",
    cell: ({ getValue }) => <ScoreCell value={getValue<number | null>()} />,
  },
];

const demoRows: DemoRow[] = [
  { id: "1", name: "GPT-5.6 Sol", score: 9.2 },
  { id: "2", name: "Claude Sonnet 5", score: 0 },
  { id: "3", name: "MiMo-V2.5-Pro", score: null },
];

const sectionStyle = {
  display: "flex",
  flexDirection: "column" as const,
  gap: "var(--space-3)",
  padding: "var(--space-4)",
  borderBottom: "1px solid var(--border)",
};

const rowStyle = {
  display: "flex",
  flexWrap: "wrap" as const,
  gap: "var(--space-2)",
  alignItems: "center",
};

export default function GalleryPage() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [toggleOn, setToggleOn] = useState(true);
  const [weight, setWeight] = useState(40);
  const [density, setDensity] = useState<"comfortable" | "standard" | "compact">(
    "standard",
  );
  const [view, setView] = useState<"table" | "cards" | "compact">("table");
  const [combo, setCombo] = useState<string | null>("glm");
  const [tab, setTab] = useState("overview");
  const [filterOn, setFilterOn] = useState(true);

  const columns = useMemo(() => demoColumns, []);

  return (
    <div
      style={{
        background: "var(--bg-app)",
        color: "var(--text)",
        minHeight: "100%",
        fontFamily: "var(--font-sans)",
        padding: "var(--space-6)",
      }}
    >
      <h1
        style={{
          fontSize: "var(--text-page-size)",
          fontWeight: "var(--text-page-weight)",
          margin: "0 0 var(--space-2)",
        }}
      >
        UI primitives gallery
      </h1>
      <p style={{ color: "var(--text-muted)", marginTop: 0 }}>
        Development aid — not linked from navigation.
      </p>

      <section style={sectionStyle}>
        <h2 style={heading()}>Button / IconButton</h2>
        <div style={rowStyle}>
          <Button variant="primary">Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
          <Button size="sm">Small</Button>
          <Button size="md">Medium</Button>
          <Button size="lg">Large</Button>
          <Button disabled>Disabled</Button>
          <IconButton label="More actions">⋯</IconButton>
        </div>
      </section>

      <section style={sectionStyle}>
        <h2 style={heading()}>Badge / StatusChip / Tag / FilterChip</h2>
        <div style={rowStyle}>
          <Badge color="info">Flagship</Badge>
          <Badge color="neutral">Legacy</Badge>
          <StatusChip color="ok" label="Active" />
          <StatusChip color="warn" label="Preview" />
          <StatusChip color="danger" label="Deprecated" />
          <StatusChip color="info" label="Preferred" />
          <Tag name="reasoning" color="advanced" />
          <Tag name="coding" onRemove={() => undefined} />
          {filterOn ? (
            <FilterChip
              label="Provider"
              value="OpenAI"
              onRemove={() => setFilterOn(false)}
            />
          ) : null}
        </div>
      </section>

      <section style={sectionStyle}>
        <h2 style={heading()}>Card / Panel</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <Card hoverable>Hoverable card body</Card>
          <Panel title="Quota summary" action={<Button size="sm">Manage</Button>}>
            Panel content with optional action.
          </Panel>
        </div>
      </section>

      <section style={sectionStyle}>
        <h2 style={heading()}>ScoreCell (null ≠ 0)</h2>
        <div style={rowStyle}>
          <span style={{ color: "var(--text-muted)" }}>null →</span>
          <ScoreCell value={null} label="Personal" />
          <span style={{ color: "var(--text-muted)" }}>0 →</span>
          <ScoreCell value={0} scale="ten" />
          <ScoreCell value={3} scale="ten" />
          <ScoreCell value={5} scale="ten" />
          <ScoreCell value={7.5} scale="ten" />
          <ScoreCell value={9.8} scale="ten" />
          <ScoreCell value={92} scale="hundred" />
        </div>
      </section>

      <section style={sectionStyle}>
        <h2 style={heading()}>ProgressBar</h2>
        <div style={{ maxWidth: 360, display: "grid", gap: 12 }}>
          <ProgressBar label="OpenCode Go" value={42} max={90} color="info" />
          <ProgressBar label="ChatGPT Plus" unlimited color="ok" />
          <ProgressBar label="Near limit" value={88} max={100} color="warn" />
        </div>
      </section>

      <section style={sectionStyle}>
        <h2 style={heading()}>Sparkline / Skeleton / EmptyState</h2>
        <div style={rowStyle}>
          <Sparkline values={[2, 4, 3, 8, 6, 9, 7]} series={1} fill label="Trend" />
          <Sparkline values={[9, 7, 6, 4, 3]} series={6} />
          <Skeleton width={120} height={16} />
          <Skeleton width={32} height={32} radius="full" />
        </div>
        <Card padding="none">
          <EmptyState
            icon="∅"
            title="No models"
            message="Adjust filters or create a model to get started."
            action={<Button size="sm">New model</Button>}
          />
        </Card>
      </section>

      <section style={sectionStyle}>
        <h2 style={heading()}>Form controls</h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
            maxWidth: 640,
          }}
        >
          <Input placeholder="Search models" />
          <Select
            options={[
              { value: "all", label: "All providers" },
              { value: "openai", label: "OpenAI" },
            ]}
            defaultValue="all"
          />
          <Combobox
            value={combo}
            onChange={setCombo}
            options={[
              { value: "sol", label: "GPT-5.6 Sol" },
              { value: "glm", label: "GLM-5.2" },
              { value: "mimo", label: "MiMo-V2.5-Pro" },
            ]}
          />
          <Textarea placeholder="Notes" rows={3} />
          <Toggle
            checked={toggleOn}
            onChange={setToggleOn}
            label="Favourite"
          />
          <Slider
            label="Reasoning weight"
            value={weight}
            onChange={setWeight}
            min={0}
            max={100}
          />
        </div>
      </section>

      <section style={sectionStyle}>
        <h2 style={heading()}>Tabs / SegmentedControl</h2>
        <SegmentedControl
          label="View mode"
          value={view}
          onChange={setView}
          options={[
            { value: "table", label: "Table" },
            { value: "cards", label: "Cards" },
            { value: "compact", label: "Compact" },
          ]}
        />
        <SegmentedControl
          label="Density"
          size="sm"
          value={density}
          onChange={setDensity}
          options={[
            { value: "comfortable", label: "Comfortable" },
            { value: "standard", label: "Standard" },
            { value: "compact", label: "Compact" },
          ]}
        />
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="access">Access</TabsTrigger>
            <TabsTrigger value="research">Research</TabsTrigger>
          </TabsList>
          <TabsContent value="overview">Overview tab body</TabsContent>
          <TabsContent value="access">Access tab body</TabsContent>
          <TabsContent value="research">Research tab body</TabsContent>
        </Tabs>
      </section>

      <section style={sectionStyle}>
        <h2 style={heading()}>DataTable (density={density})</h2>
        <DataTable
          data={demoRows}
          columns={columns}
          density={density}
          enableSelection
          getRowId={(r) => r.id}
        />
      </section>

      <section style={sectionStyle}>
        <h2 style={heading()}>Popover / Dialog / Drawer</h2>
        <div style={rowStyle}>
          <Popover trigger={<Button variant="secondary">Open popover</Button>}>
            <div style={{ padding: 4 }}>Popover content uses shadow token.</div>
          </Popover>
          <Button onClick={() => setDialogOpen(true)}>Open dialog</Button>
          <Button onClick={() => setDrawerOpen(true)}>Open drawer</Button>
        </div>
      </section>

      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title="Confirm action"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => setDialogOpen(false)}>Confirm</Button>
          </>
        }
      >
        Dialog body with focus trap and Escape to close.
      </Dialog>

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title="GPT-5.6 Sol"
        size="md"
        footer={
          <>
            <Button variant="secondary">Compare</Button>
            <Button>Edit model</Button>
          </>
        }
      >
        <p style={{ color: "var(--text-muted)", marginTop: 0 }}>
          Right drawer with focus trap and Escape to close.
        </p>
        <div style={rowStyle}>
          <ScoreCell value={null} label="Personal" />
          <ScoreCell value={8.4} label="External" />
          <StatusChip color="ok" label="Active" />
        </div>
      </Drawer>
    </div>
  );
}

function heading(): CSSProperties {
  return {
    fontSize: "var(--text-section-size)",
    fontWeight: 600,
    margin: 0,
    color: "var(--text)",
  };
}
