import NextAuth from 'next-auth';
import { NextResponse } from 'next/server';

// Edge-compatible middleware — no bcryptjs, only JWT verification.
// Session callback maps the custom token fields so `auth.user.mustChangePassword`
// is readable here (the main auth config already signed them into the JWT).
export const { auth: middleware } = NextAuth({
  secret: process.env.AUTH_SECRET,
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  providers: [],
  callbacks: {
    session: async ({ session, token }) => {
      if (token.id) session.user.id = token.id as string;
      session.user.mustChangePassword = Boolean(token.mustChangePassword);
      session.user.isAdmin = Boolean(token.isAdmin);
      return session;
    },
    authorized: ({ auth, request }) => {
      if (!auth) return false; // not signed in → NextAuth redirects to /login
      // Force first-login password change: trap the user on /reset-password
      const path = request.nextUrl.pathname;
      // Only trap page navigations; API routes enforce their own guards, and
      // redirecting a fetch to an HTML page would break its JSON parsing.
      if (auth.user?.mustChangePassword && !path.startsWith('/api') && path !== '/reset-password') {
        return NextResponse.redirect(new URL('/reset-password', request.nextUrl));
      }
      return true;
    },
  },
});

export const config = {
  matcher: ['/((?!login|api/auth|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webp|gif)).*)'],
};
