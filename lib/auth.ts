import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { connectDB } from "@/lib/mongoose";
import AppSession from "@/models/AppSession";
import { v4 as uuidv4 } from "uuid";

if (!process.env.NEXTAUTH_SECRET) throw new Error("NEXTAUTH_SECRET is not set");

const googleClientId = process.env.GOOGLE_CLIENT_ID || process.env.GMAIL_OAUTH_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET || process.env.GMAIL_OAUTH_CLIENT_SECRET;

async function isAllowedGoogle(email: string): Promise<boolean> {
  // 1. Check env-var allowlist (original behaviour)
  const allowed = process.env.ALLOWED_GOOGLE_EMAILS || "";
  const envAllowed = allowed.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (envAllowed.includes(email.toLowerCase())) return true;

  // 2. Check DB-managed users (googleId field stores their email)
  try {
    await connectDB();
    const UserModel = (await import("@/models/User")).default;
    const found = await UserModel.findOne({ googleId: email.toLowerCase().trim() }).lean();
    if (found) return true;
  } catch {
    // Non-fatal
  }
  return false;
}

async function verifyAdminPassword(candidate: string): Promise<boolean> {
  const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH;
  if (adminPasswordHash) {
    return bcrypt.compare(candidate, adminPasswordHash);
  }

  const adminPassword = process.env.ADMIN_PASSWORD;
  return Boolean(adminPassword && candidate === adminPassword);
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

        // 1. Check env-var admin credentials first (original behaviour)
        if (adminEmail) {
          const emailMatch = credentials.email.toLowerCase() === adminEmail.toLowerCase();
          const passwordMatch = await verifyAdminPassword(credentials.password);
          if (emailMatch && passwordMatch) {
            return {
              id: "admin",
              name: process.env.ADMIN_NAME || "Admin",
              email: adminEmail,
            };
          }
        }

        // 2. Check DB-managed password users
        try {
          await connectDB();
          const UserModel = (await import("@/models/User")).default;
          const dbUser = await UserModel.findOne({
            email: credentials.email.toLowerCase().trim(),
            googleId: null,
            password: { $ne: null },
          });
          if (dbUser && await dbUser.comparePassword(credentials.password)) {
            return {
              id: String(dbUser._id),
              name: dbUser.name,
              email: dbUser.email,
            };
          }
        } catch {
          // Non-fatal — fall through
        }

        throw new Error("Invalid email or password");
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
        if (!(await isAllowedGoogle(email))) return false;
      }
      return true;
    },

    async jwt({ token, user, account, trigger }) {
      if (user) {
        token.id = user.id;
        token.provider = account?.provider ?? "credentials";
      }
      // Attach a stable sessionToken to the JWT so we can track it in DB
      if (!token.sessionToken) {
        token.sessionToken = uuidv4();
      }
      // On initial sign-in, write a session record to MongoDB
      if (trigger === "signIn" && user) {
        try {
          await connectDB();
          const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
          await AppSession.findOneAndUpdate(
            { sessionToken: token.sessionToken as string },
            {
              sessionToken: token.sessionToken as string,
              userEmail: user.email ?? "",
              userName: user.name ?? "",
              provider: (account?.provider === "google" ? "google" : "credentials") as "google" | "credentials",
              expires,
            },
            { upsert: true, new: true }
          );
        } catch {
          // Non-fatal — session tracking failure should not block login
        }
      }
      return token;
    },

    async session({ session, token }) {
      if (token?.id) {
        (session.user as typeof session.user & { id: string }).id = token.id as string;
      }
      if (token?.sessionToken) {
        (session as typeof session & { sessionToken: string }).sessionToken = token.sessionToken as string;
      }
      return session;
    },
  },

  events: {
    async signOut({ token }) {
      // Remove the session record when the user explicitly signs out
      if (token?.sessionToken) {
        try {
          await connectDB();
          await AppSession.deleteOne({ sessionToken: token.sessionToken as string });
        } catch {
          // Non-fatal
        }
      }
    },
  },

  pages: { signIn: "/login", error: "/login" },
  session: { strategy: "jwt" },
  secret: process.env.NEXTAUTH_SECRET,
};
