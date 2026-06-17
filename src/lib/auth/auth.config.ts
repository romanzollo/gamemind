import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  providers: [],
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = Boolean(auth?.user);
      const isProtected =
        nextUrl.pathname.startsWith("/profile") ||
        nextUrl.pathname.startsWith("/admin");

      if (isProtected) {
        return isLoggedIn;
      }

      return true;
    },
  },
} satisfies NextAuthConfig;
