import { redirect } from 'next/navigation';
import { auth, signOut } from '@/lib/auth';

export default async function ProtectedLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await auth(); if (!session?.user?.email) redirect('/sign-in');
  return <div className="shell"><aside className="sidebar"><div className="brand">MODEL MONITOR</div><nav className="nav"><a href="/">Overview</a><a href="/models">Models</a><a href="/subscriptions">Subscriptions</a><a href="/access">Access matrix</a><a href="/benchmarks">Benchmarks</a><a href="/settings">Settings</a></nav></aside><main className="main"><header className="topbar"><input className="search" aria-label="Global search" placeholder="Search models, aliases, subscriptions..." disabled /><form action={async () => { 'use server'; await signOut({ redirectTo: '/sign-in' }); }}><button type="submit">Sign out</button></form></header>{children}</main></div>;
}
