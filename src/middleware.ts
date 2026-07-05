import NextAuth from 'next-auth';

// Edge-compatible middleware — no bcryptjs, only JWT verification
export const { auth: middleware } = NextAuth({
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  providers: [],
  callbacks: {
    authorized: ({ auth }) => !!auth,
  },
});

export const config = {
  matcher: ['/((?!login|api/auth|_next/static|_next/image|favicon.ico).*)'],
};
