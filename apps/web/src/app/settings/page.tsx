import Link from "next/link";

const entries = [
  ["tags", "Tags", "Create, categorise, merge and maintain model tags."],
  ["skills", "Skills", "Manage custom skills, ordering and archive state."],
  ["import-export", "Import / Export", "Preview CSV imports and download exports."],
  ["backup", "Backup and restore", "Create, download, verify and restore archives."],
  ["appearance", "Appearance", "Density and responsive sidebar behaviour."],
  ["general", "General", "Surviving application preferences."],
] as const;

export default function SettingsPage() {
  return <section className="space-y-6" aria-labelledby="settings-title">
    <header className="space-y-1"><h1 id="settings-title" className="text-2xl font-bold text-foreground">Settings</h1><p className="text-sm text-muted-foreground">Secondary workspace settings. These destinations are intentionally not part of primary navigation.</p></header>
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{entries.map(([slug, title, description]) => <Link key={slug} href={`/settings/${slug}`} className="rounded-lg border border-border bg-card p-5 transition-colors hover:bg-accent"><h2 className="font-semibold text-foreground">{title}</h2><p className="mt-2 text-sm text-muted-foreground">{description}</p><span className="mt-4 inline-block text-sm text-primary">Open settings →</span></Link>)}</div>
  </section>;
}
