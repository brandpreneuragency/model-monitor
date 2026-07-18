import { signIn } from '@/lib/auth';

export default function SignInPage() {
  return <main className="auth"><section className="card"><p className="muted">Private registry</p><h1>Model Monitor</h1><p className="muted">Sign in with an allow-listed Google account.</p><form action={async () => { 'use server'; await signIn('google', { redirectTo: '/' }); }}><button type="submit">Continue with Google</button></form></section></main>;
}
