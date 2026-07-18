import Google from 'next-auth/providers/google';
import NextAuth from 'next-auth';
import { sql } from '@model-monitor/database/client';

const allowedEmails = () => new Set((process.env.ALLOWED_EMAILS ?? '').split(',').map((email) => email.trim().toLowerCase()).filter(Boolean));

export const { auth, handlers, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: 'jwt' },
  providers: [Google],
  callbacks: {
    async signIn({ user }) {
      const email = user.email?.toLowerCase();
      if (!email || !allowedEmails().has(email)) return '/denied';
      await sql`INSERT INTO users (email, display_name, role) VALUES (${email}, ${user.name ?? null}, 'owner') ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name, updated_at = now()`;
      return true;
    },
    async session({ session }) {
      const email = session.user?.email?.toLowerCase();
      if (!email || !allowedEmails().has(email)) session.user.email = '';
      return session;
    },
  },
  pages: { signIn: '/sign-in', error: '/denied' },
});
