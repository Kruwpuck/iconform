import 'server-only';
import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { prisma } from '@/server/infra/prisma';

// ponytail: in-memory, resets on restart, correct only for 1 instance.
// Upgrade to Redis if >1 replica.
const attempts = new Map<string, { n: number; until: number }>();

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.AUTH_SECRET,
  session: { strategy: 'jwt', maxAge: 60 * 60 * 8 },
  pages: {
    signIn: '/login',
  },
  providers: [
    Credentials({
      credentials: {
        username: { label: 'Username' },
        password: { label: 'Password', type: 'password' },
      },
      authorize: async (credentials) => {
        if (!credentials?.username || !credentials?.password) return null;

        // ponytail: keyed by username not IP — acceptable for an internal tool
        // where usernames are known and IP headers are unreliable behind proxies.
        const key = String(credentials.username);
        const entry = attempts.get(key);
        if (entry && Date.now() < entry.until) return null;

        const user = await prisma.user.findUnique({
          where: { username: key },
        });

        const valid = user
          ? await bcrypt.compare(String(credentials.password), user.passwordHash)
          : false;

        if (!user || !valid) {
          const cur = attempts.get(key) ?? { n: 0, until: 0 };
          cur.n += 1;
          if (cur.n >= 5) {
            cur.until = Date.now() + 15 * 60 * 1000;
            cur.n = 0;
          }
          attempts.set(key, cur);
          return null;
        }

        attempts.delete(key);
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          mustChangePassword: user.mustChangePassword,
          isAdmin: user.createdById === null,
        };
      },
    }),
  ],
  callbacks: {
    jwt: async ({ token, user, trigger }) => {
      if (user) {
        token.id = user.id;
        token.mustChangePassword = (user as { mustChangePassword?: boolean }).mustChangePassword ?? false;
        token.isAdmin = (user as { isAdmin?: boolean }).isAdmin ?? false;
      }
      // After a password reset the client calls update() → re-read the flag
      if (trigger === 'update' && token.id) {
        const fresh = await prisma.user.findUnique({ where: { id: token.id as string } });
        if (fresh) token.mustChangePassword = fresh.mustChangePassword;
      }
      return token;
    },
    session: async ({ session, token }) => {
      if (token.id) session.user.id = token.id as string;
      session.user.mustChangePassword = Boolean(token.mustChangePassword);
      session.user.isAdmin = Boolean(token.isAdmin);
      return session;
    },
  },
});
