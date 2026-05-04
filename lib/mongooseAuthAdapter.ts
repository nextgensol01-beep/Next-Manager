import mongoose from "mongoose";
import type {
  Adapter,
  AdapterAccount,
  AdapterSession,
  AdapterUser,
  VerificationToken,
} from "next-auth/adapters";
import { connectDB } from "@/lib/mongoose";
import User from "@/models/User";
import AuthAccount from "@/models/AuthAccount";
import AuthSession from "@/models/AuthSession";
import AuthVerificationToken from "@/models/AuthVerificationToken";
import { isActiveUser, normalizeLoginIdentifier } from "@/lib/authUsers";

type UserDocument = {
  _id: { toString(): string };
  name?: string | null;
  email?: string | null;
  loginId?: string | null;
  status?: string | null;
  role?: string | null;
  emailVerified?: Date | null;
  image?: string | null;
};

const toAdapterUser = (user: UserDocument): AdapterUser & { role?: string | null } => ({
  id: user._id.toString(),
  name: user.name || null,
  email: user.email || user.loginId || "",
  emailVerified: user.emailVerified || null,
  image: user.image || null,
  role: user.role || "user",
});

const toAdapterSession = (session: {
  sessionToken: string;
  userId: string;
  expires: Date;
}): AdapterSession => ({
  sessionToken: session.sessionToken,
  userId: session.userId,
  expires: session.expires,
});

const isObjectId = (id: string) => mongoose.Types.ObjectId.isValid(id);

export function MongooseAuthAdapter(): Adapter {
  return {
    async createUser(user: Omit<AdapterUser, "id">) {
      await connectDB();
      const created = await User.create({
        name: user.name || user.email,
        email: user.email ? normalizeLoginIdentifier(user.email) : undefined,
        emailVerified: user.emailVerified,
        image: user.image,
        status: "active",
        loginMethods: ["google"],
        googleStatus: "approved",
        googleApprovedAt: new Date(),
      });
      return toAdapterUser(created);
    },

    async getUser(id: string) {
      await connectDB();
      if (!isObjectId(id)) return null;
      const user = await User.findById(id);
      return user ? toAdapterUser(user) : null;
    },

    async getUserByEmail(email: string) {
      await connectDB();
      const user = await User.findOne({ email: normalizeLoginIdentifier(email) });
      return user ? toAdapterUser(user) : null;
    },

    async getUserByAccount({ provider, providerAccountId }: Pick<AdapterAccount, "provider" | "providerAccountId">) {
      await connectDB();
      const account = await AuthAccount.findOne({ provider, providerAccountId })
        .lean() as unknown as { userId?: string } | null;
      if (!account?.userId || !isObjectId(String(account.userId))) return null;

      const user = await User.findById(String(account.userId));
      return user ? toAdapterUser(user) : null;
    },

    async updateUser(user: Partial<AdapterUser> & Pick<AdapterUser, "id">) {
      await connectDB();
      const updated = await User.findByIdAndUpdate(
        user.id,
        {
          $set: {
            ...(typeof user.name !== "undefined" ? { name: user.name } : {}),
            ...(typeof user.email !== "undefined" ? { email: user.email } : {}),
            ...(typeof user.emailVerified !== "undefined" ? { emailVerified: user.emailVerified } : {}),
            ...(typeof user.image !== "undefined" ? { image: user.image } : {}),
          },
        },
        { new: true, runValidators: true }
      );
      if (!updated) throw new Error("User not found");
      return toAdapterUser(updated);
    },

    async deleteUser(userId: string) {
      await connectDB();
      const user = await User.findByIdAndDelete(userId);
      await Promise.all([
        AuthAccount.deleteMany({ userId }),
        AuthSession.deleteMany({ userId }),
      ]);
      return user ? toAdapterUser(user) : null;
    },

    async linkAccount(account: AdapterAccount) {
      await connectDB();
      const created = await AuthAccount.findOneAndUpdate(
        {
          provider: account.provider,
          providerAccountId: account.providerAccountId,
        },
        { $set: account },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      ).lean() as unknown as AdapterAccount | null;
      await User.findByIdAndUpdate(account.userId, {
        $addToSet: { loginMethods: "google" },
        $set: {
          googleId: account.provider === "google" ? account.providerAccountId : undefined,
          googleStatus: account.provider === "google" ? "approved" : undefined,
          googleApprovedAt: new Date(),
        },
      });
      return created as unknown as AdapterAccount;
    },

    async unlinkAccount({ provider, providerAccountId }: Pick<AdapterAccount, "provider" | "providerAccountId">) {
      await connectDB();
      const deleted = await AuthAccount.findOneAndDelete({ provider, providerAccountId })
        .lean() as unknown as AdapterAccount | null;
      return deleted || undefined;
    },

    async createSession(session: AdapterSession) {
      await connectDB();
      const googleAccount = await AuthAccount.findOne({
        userId: session.userId,
        provider: "google",
      }).select("_id").lean();
      const provider = googleAccount ? "google" : "credentials";
      const created = await AuthSession.create({ ...session, provider });
      await User.findByIdAndUpdate(session.userId, {
        $set: {
          lastLoginAt: new Date(),
          lastLoginProvider: provider,
        },
      });
      return toAdapterSession(created);
    },

    async getSessionAndUser(sessionToken: string) {
      await connectDB();
      const session = await AuthSession.findOne({ sessionToken });
      if (!session) return null;

      const user = await User.findById(session.userId);
      if (!user) return null;
      if (!isActiveUser(user)) {
        await AuthSession.findOneAndDelete({ sessionToken });
        return null;
      }

      return {
        session: toAdapterSession(session),
        user: toAdapterUser(user),
      };
    },

    async updateSession(session: Partial<AdapterSession> & Pick<AdapterSession, "sessionToken">) {
      await connectDB();
      const updated = await AuthSession.findOneAndUpdate(
        { sessionToken: session.sessionToken },
        { $set: session },
        { new: true }
      );
      return updated ? toAdapterSession(updated) : null;
    },

    async deleteSession(sessionToken: string) {
      await connectDB();
      const deleted = await AuthSession.findOneAndDelete({ sessionToken })
        .lean() as unknown as AdapterSession | null;
      return deleted ? toAdapterSession(deleted) : null;
    },

    async createVerificationToken(verificationToken: VerificationToken) {
      await connectDB();
      await AuthVerificationToken.create(verificationToken);
      return verificationToken;
    },

    async useVerificationToken(params: { identifier: string; token: string }) {
      await connectDB();
      const token = await AuthVerificationToken.findOneAndDelete(params)
        .lean() as unknown as VerificationToken | null;
      return token ? {
        identifier: String(token.identifier),
        token: String(token.token),
        expires: token.expires,
      } satisfies VerificationToken : null;
    },
  };
}
