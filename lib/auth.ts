import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { MongooseAuthAdapter } from "@/lib/mongooseAuthAdapter";
import { connectDB } from "@/lib/mongoose";
import User from "@/models/User";
import {
  isActiveUser,
  isEnvAdminEmail,
  isEnvAllowedGoogleEmail,
  normalizeLoginIdentifier,
} from "@/lib/authUsers";
import {
  SESSION_MAX_AGE_SECONDS,
  SESSION_UPDATE_AGE_SECONDS,
} from "@/lib/authSessionConfig";

if (!process.env.NEXTAUTH_SECRET) throw new Error("NEXTAUTH_SECRET is not set");

const googleClientId = process.env.GOOGLE_CLIENT_ID || process.env.GMAIL_OAUTH_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET || process.env.GMAIL_OAUTH_CLIENT_SECRET;

const providers: NonNullable<NextAuthOptions["providers"]> = [];

if (googleClientId && googleClientSecret) {
  providers.unshift(
    GoogleProvider({
      clientId: googleClientId,
      clientSecret: googleClientSecret,
      allowDangerousEmailAccountLinking: true,
    })
  );
}

export const authOptions: NextAuthOptions = {
  adapter: MongooseAuthAdapter(),
  providers,

  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider === "google") {
        const email = normalizeLoginIdentifier(String(profile?.email || ""));
        if (!email) return false;

        await connectDB();
        const user = await User.findOne({ email });

        if (user?.status === "disabled" || user?.status === "rejected") {
          return false;
        }

        if (isEnvAllowedGoogleEmail(email)) {
          if (user && !isActiveUser(user)) {
            user.status = "active";
          }
          if (user) {
            user.googleStatus = "approved";
            user.googleApprovedAt = new Date();
            if (!user.loginMethods.includes("google")) user.loginMethods.push("google");
            await user.save();
          }
          return true;
        }

        if (user && isActiveUser(user) && user.googleStatus === "approved" && user.loginMethods.includes("google")) {
          return true;
        }

        if (user) {
          if (!user.loginMethods.includes("google")) {
            user.loginMethods.push("google");
          }
          if (user.googleStatus !== "rejected") {
            user.googleStatus = "pending";
            user.googleRequestedAt = new Date();
          }
          await user.save();
          return false;
        }

        await User.findOneAndUpdate(
          { email },
          {
            $set: {
              name: String(profile?.name || email),
              email,
              image: String(profile?.image || ""),
              status: "pending",
              role: "user",
              googleStatus: "pending",
              googleRequestedAt: new Date(),
            },
            $addToSet: { loginMethods: "google" },
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        return false;
      }
      return true;
    },
    async session({ session, user }) {
      if (user?.id) {
        (session.user as typeof session.user & { id: string }).id = user.id;
      }
      const sessionUser = session.user as typeof session.user & { role?: "admin" | "user" };
      const adapterUser = user as typeof user & { role?: string | null };
      sessionUser.role = adapterUser?.role === "admin" || isEnvAdminEmail(session.user?.email)
        ? "admin"
        : "user";
      return session;
    },
  },

  pages: { signIn: "/login", error: "/login" },
  session: {
    strategy: "database",
    maxAge: SESSION_MAX_AGE_SECONDS,
    updateAge: SESSION_UPDATE_AGE_SECONDS,
  },
  secret: process.env.NEXTAUTH_SECRET,
};
