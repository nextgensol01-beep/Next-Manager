import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";

if (!process.env.NEXTAUTH_SECRET) throw new Error("NEXTAUTH_SECRET is not set");

const googleClientId = process.env.GOOGLE_CLIENT_ID || process.env.GMAIL_OAUTH_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET || process.env.GMAIL_OAUTH_CLIENT_SECRET;

function isAllowedGoogle(email: string): boolean {
  const allowed = process.env.ALLOWED_GOOGLE_EMAILS || "";
  if (!allowed.trim()) return false;
  return allowed.split(",").map((e) => e.trim().toLowerCase()).includes(email.toLowerCase());
}

const providers: NonNullable<NextAuthOptions["providers"]> = [
  CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Email and password are required");
        }

        const adminEmail = process.env.ADMIN_EMAIL;
        const adminPassword = process.env.ADMIN_PASSWORD;

        if (!adminEmail || !adminPassword) {
          throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD are not set in .env.local");
        }

        const emailMatch = credentials.email.toLowerCase() === adminEmail.toLowerCase();
        const passwordMatch = credentials.password === adminPassword;

        if (!emailMatch || !passwordMatch) {
          throw new Error("Invalid email or password");
        }

        return {
          id: "admin",
          name: process.env.ADMIN_NAME || "Admin",
          email: adminEmail,
        };
      },
    }),
];

if (googleClientId && googleClientSecret) {
  providers.unshift(
    GoogleProvider({
      clientId: googleClientId,
      clientSecret: googleClientSecret,
    })
  );
}

export const authOptions: NextAuthOptions = {
  providers,

  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider === "google") {
        const email = profile?.email || "";
        if (!isAllowedGoogle(email)) return false;
      }
      return true;
    },
    async jwt({ token, user }) {
      if (user) token.id = user.id;
      return token;
    },
    async session({ session, token }) {
      if (token?.id) {
        (session.user as typeof session.user & { id: string }).id = token.id as string;
      }
      return session;
    },
  },

  pages: { signIn: "/login", error: "/login" },
  session: { strategy: "jwt" },
  secret: process.env.NEXTAUTH_SECRET,
};
