import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { cookies, headers } from "next/headers";
import { MongooseAuthAdapter } from "@/lib/mongooseAuthAdapter";
import { connectDB } from "@/lib/mongoose";
import User from "@/models/User";
import AuthAccount from "@/models/AuthAccount";
import { isActiveUser, isEnvAllowedGoogleEmail, normalizeLoginIdentifier } from "@/lib/authUsers";
import { SESSION_MAX_AGE_SECONDS, SESSION_UPDATE_AGE_SECONDS } from "@/lib/authSessionConfig";
import { cookieOptions, issueChallenge, PREAUTH_COOKIE, takeSecurityLimit } from "@/lib/server/account-security";
import { newOpaqueToken } from "@/lib/server/account-security-crypto";
import { notifySecurity, requestMetadata } from "@/lib/server/account-security-mail";

if (!process.env.NEXTAUTH_SECRET) throw new Error("NEXTAUTH_SECRET is not set");
const clientId = process.env.GOOGLE_CLIENT_ID || process.env.GMAIL_OAUTH_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET || process.env.GMAIL_OAUTH_CLIENT_SECRET;

export const authOptions: NextAuthOptions = {
  adapter: MongooseAuthAdapter(),
  providers: clientId && clientSecret ? [GoogleProvider({ clientId, clientSecret, allowDangerousEmailAccountLinking: true })] : [],
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider !== "google") return false;
      const identity = profile as { email?: string; email_verified?: boolean; sub?: string; name?: string; picture?: string } | undefined;
      const email = normalizeLoginIdentifier(identity?.email || "");
      const metadata = requestMetadata(new Headers(await headers()));
      if (!email || identity?.email_verified !== true || !identity.sub || identity.sub !== account.providerAccountId) {
        notifySecurity({ event: "Google identity verification failed", status: "Failed", verified: false, email, metadata });
        return false;
      }
      await connectDB();
      if (!(await takeSecurityLimit(`google:${identity.sub}`, 15, 15 * 60_000)).allowed) return "/login?error=RateLimited";
      // Prefer Google's immutable subject; email alone never overwrites a linked identity.
      const linked = await AuthAccount.findOne({ provider: "google", providerAccountId: identity.sub });
      let user = linked ? await User.findById(linked.userId) : await User.findOne({ googleId: identity.sub });
      if (!user && !linked) user = await User.findOne({ email });
      if (linked && !user) return false;
      if (user?.googleId && user.googleId !== identity.sub && user.googleId !== user.email) return false;
      if (user?.status === "disabled" || user?.status === "rejected" || user?.googleStatus === "rejected") {
        notifySecurity({ event: "Rejected or disabled Google account attempted access", status: "Rejected", verified: true, name: user.name, email, metadata });
        return "/login?error=GoogleRejected";
      }
      const newlyRequested = !user || user.googleStatus === "none";
      if (user && isActiveUser(user) && user.googleStatus === "none" && isEnvAllowedGoogleEmail(email)) {
        user.googleStatus = "approved";
        user.googleApprovedAt = new Date();
        if (!user.loginMethods.includes("google")) user.loginMethods.push("google");
        await user.save();
      }
      const approved = user && isActiveUser(user) && user.googleStatus === "approved" && user.loginMethods.includes("google");
      // Environment allow-list bootstraps first-time identities only, never pending/rejected users.
      if (!user) {
        const allowed = isEnvAllowedGoogleEmail(email);
        user = await User.findOneAndUpdate({ email }, { $setOnInsert: {
          name: identity.name || email, email, googleId: identity.sub, image: identity.picture,
          role: "user", status: allowed ? "active" : "pending", loginMethods: ["google"],
          googleStatus: allowed ? "approved" : "pending", googleRequestedAt: new Date(),
          ...(allowed ? { googleApprovedAt: new Date() } : {}), emailVerified: new Date(),
        } }, { upsert: true, new: true, setDefaultsOnInsert: true });
      }
      const canSignIn = approved || isActiveUser(user) && user.googleStatus === "approved" && user.loginMethods.includes("google");
      if (!canSignIn) {
        await User.updateOne({ _id: user._id }, { $set: {
          googleId: identity.sub, googleStatus: "pending", emailVerified: new Date(),
          googleRequestLocation: metadata.location, lastLoginIp: metadata.ip, lastLoginUserAgent: metadata.userAgent,
          ...(!user.googleRequestedAt ? { googleRequestedAt: new Date() } : {}),
        }, $addToSet: { loginMethods: "google" } });
        notifySecurity({ event: newlyRequested ? "New Google account requesting access" : "Pending Google user attempted login again", status: "Pending Approval", verified: true, name: user.name, email, metadata });
        return "/login?error=GooglePending";
      }
      await User.updateOne({ _id: user._id }, { $set: { googleId: identity.sub, emailVerified: new Date() } });
      // Bind the verified immutable identity even when website 2FA interrupts NextAuth's
      // normal adapter flow. A recovered mailbox never becomes a new Google identity.
      await AuthAccount.findOneAndUpdate({ provider: "google", providerAccountId: identity.sub }, { $setOnInsert: { ...account, type: account.type || "oauth", userId: String(user._id) } }, { upsert: true });
      notifySecurity({ event: "Google authentication completed", status: "Successful", verified: true, name: user.name, email, metadata, reason: user.twoFactorEnabled ? "Website second factor still required" : "Account approved" });
      if (user.twoFactorEnabled) {
        try {
          const binding = newOpaqueToken();
          const challenge = await issueChallenge({ userId: String(user._id), binding, action: "login", provider: "google" });
          (await cookies()).set(PREAUTH_COOKIE, `${binding}.${challenge.challengeId}`, { ...cookieOptions, maxAge: 300 });
          return "/login?secondFactor=1";
        } catch { return "/login?error=VerificationUnavailable"; }
      }
      return true;
    },
    async session({ session, user }) {
      (session.user as typeof session.user & { id: string; role: string }).id = user.id;
      (session.user as typeof session.user & { role: string }).role = (user as typeof user & { role?: string }).role === "admin" ? "admin" : "user";
      return session;
    },
  },
  // Do not emit provider error objects: they can contain OAuth tokens and profile data.
  logger: {
    error(code) { console.warn("Authentication provider error:", code); },
    warn(code) { console.warn("Authentication provider warning:", code); },
    debug() {},
  },
  pages: { signIn: "/login", error: "/login" },
  session: { strategy: "database", maxAge: SESSION_MAX_AGE_SECONDS, updateAge: SESSION_UPDATE_AGE_SECONDS },
  secret: process.env.NEXTAUTH_SECRET,
};
