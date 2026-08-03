import 'next-auth';
import 'next-auth/jwt';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      mustChangePassword: boolean;
      isAdmin: boolean;
    };
  }
  interface User {
    mustChangePassword?: boolean;
    isAdmin?: boolean;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id?: string;
    mustChangePassword?: boolean;
    isAdmin?: boolean;
  }
}
