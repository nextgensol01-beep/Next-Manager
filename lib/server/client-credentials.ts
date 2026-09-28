import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import ClientCustomField from "@/models/ClientCustomField";
import ClientCustomFieldGroup from "@/models/ClientCustomFieldGroup";

const PREFIX = "client-secret:v1:";
const CORE_FIELDS = ["cpcbLoginId", "cpcbPassword", "otpMobileNumber"];
type RecordData = Record<string, unknown>;

function encryptionKey() {
  // Keep this secret stable; changing it requires re-encrypting existing values.
  const secret = process.env.CLIENT_CREDENTIALS_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("Client credential encryption is not configured");
  return createHash("sha256").update(`client-credentials:v1:${secret}`).digest();
}

export function encryptClientSecret(value: string): string {
  if (!value) return "";
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64");
}

export function decryptClientSecret(value: unknown): string {
  if (typeof value !== "string") return "";
  // Legacy records remain readable and are encrypted on their next client save.
  if (!value.startsWith(PREFIX)) return value;
  const bytes = Buffer.from(value.slice(PREFIX.length), "base64");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), bytes.subarray(0, 12));
  decipher.setAuthTag(bytes.subarray(12, 28));
  return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString("utf8");
}

export async function clientCredentialAccess(session: { user?: unknown } | null) {
  const admin = (session?.user as { role?: string } | undefined)?.role === "admin";
  const fields = await ClientCustomField.find({}).select("key type formTab groupId").lean();
  const groups = await ClientCustomFieldGroup.find({ formTab: "portal" }).select("_id").lean();
  const portalGroups = new Set(groups.map((group) => String(group._id)));
  const protectedKeys = new Set(fields.filter((field) => field.type === "password" || field.formTab === "portal" || portalGroups.has(String(field.groupId))).map((field) => String(field.key)));
  const passwordKeys = new Set(fields.filter((field) => field.type === "password").map((field) => String(field.key)));

  return {
    read<T extends RecordData>(client: T): T {
      const output: RecordData = { ...client };
      for (const key of CORE_FIELDS) {
        if (!admin) delete output[key];
        else if (key === "cpcbPassword" && key in output) output[key] = decryptClientSecret(output[key]);
      }
      if (client.customFields && typeof client.customFields === "object") {
        const values = { ...client.customFields as RecordData };
        for (const key of protectedKeys) {
          if (!admin) delete values[key];
          else if (passwordKeys.has(key) && key in values) values[key] = decryptClientSecret(values[key]);
        }
        output.customFields = values;
      }
      return output as T;
    },
    write(body: RecordData): RecordData {
      if (admin) return body;
      const output = { ...body };
      const values = body.customFields && typeof body.customFields === "object" ? { ...body.customFields as RecordData } : {};
      for (const key of CORE_FIELDS) {
        if (output[key]) throw new Error("Admin access required to change portal credentials");
        delete output[key];
      }
      for (const key of protectedKeys) {
        if (values[key]) throw new Error("Admin access required to change portal credentials");
        delete values[key];
      }
      output.customFields = values;
      return output;
    },
    protectedKeys,
    admin,
  };
}
