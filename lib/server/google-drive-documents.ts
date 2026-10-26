import { Readable } from "node:stream";
// Import only Drive/OAuth, rather than initializing every Google API client.
import { auth as googleAuth, drive as createDrive, drive_v3 } from "googleapis/build/src/apis/drive";

const FOLDER_MIME = "application/vnd.google-apps.folder";

function escapeDriveQuery(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function driveClient() {
  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID || process.env.GMAIL_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET || process.env.GMAIL_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_DRIVE_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Google Drive is not configured. Set GOOGLE_DRIVE_REFRESH_TOKEN and provide OAuth client credentials.");
  }
  const auth = new googleAuth.OAuth2(clientId, clientSecret);
  auth.setCredentials({ refresh_token: refreshToken });
  return createDrive({ version: "v3", auth });
}

async function findFolder(drive: drive_v3.Drive, name: string, parentId: string) {
  const response = await drive.files.list({
    q: `'${escapeDriveQuery(parentId)}' in parents and name='${escapeDriveQuery(name)}' and mimeType='${FOLDER_MIME}' and trashed=false`,
    fields: "files(id,name)",
    pageSize: 1,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  return response.data.files?.[0]?.id || null;
}

async function ensureFolder(drive: drive_v3.Drive, name: string, parentId: string) {
  const existing = await findFolder(drive, name, parentId);
  if (existing) return existing;
  const response = await drive.files.create({
    requestBody: { name, mimeType: FOLDER_MIME, parents: [parentId] },
    fields: "id",
    supportsAllDrives: true,
  });
  if (!response.data.id) throw new Error(`Unable to create Drive folder "${name}".`);
  return response.data.id;
}

function safeSegment(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim().slice(0, 120) || "Untitled";
}

async function clientFolder(drive: drive_v3.Drive, clientId: string, clientName: string) {
  const rootId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;
  if (!rootId) throw new Error("GOOGLE_DRIVE_ROOT_FOLDER_ID is not configured.");
  return ensureFolder(drive, `${safeSegment(clientName)} (${safeSegment(clientId)})`, rootId);
}

export async function uploadClientDocument(input: {
  clientId: string;
  clientName: string;
  fileName: string;
  mimeType: string;
  bytes: Buffer;
  relativePath: string;
}) {
  const drive = driveClient();
  const targetClientFolder = await clientFolder(drive, input.clientId, input.clientName);

  const pathParts = input.relativePath
    .replace(/\\/g, "/")
    .split("/")
    .filter(Boolean)
    .slice(0, -1)
    .map(safeSegment);
  let parentId = targetClientFolder;
  for (const segment of pathParts) parentId = await ensureFolder(drive, segment, parentId);

  const response = await drive.files.create({
    requestBody: { name: safeSegment(input.fileName), parents: [parentId] },
    media: {
      mimeType: input.mimeType || "application/octet-stream",
      body: Readable.from(input.bytes),
    },
    fields: "id,name,mimeType,size,webViewLink",
    supportsAllDrives: true,
  });
  if (!response.data.id) throw new Error("Google Drive did not return a file ID.");
  return {
    driveFileId: response.data.id,
    driveLink: response.data.webViewLink || `https://drive.google.com/file/d/${response.data.id}/view`,
    mimeType: response.data.mimeType || input.mimeType,
    fileSize: Number(response.data.size || input.bytes.length),
  };
}

export async function downloadDriveFile(fileId: string, signal?: AbortSignal, expectedSize?: number) {
  const drive = driveClient();
  // Keep the general document-preview API compatible; email supplies an approved limit.
  if (expectedSize === undefined) {
    const response = await drive.files.get({ fileId, alt: "media", supportsAllDrives: true }, { responseType: "arraybuffer", signal });
    const data = response.data as unknown as ArrayBuffer | Buffer<ArrayBuffer>;
    return Buffer.isBuffer(data) ? data : Buffer.from(data);
  }
  if (!Number.isSafeInteger(expectedSize) || expectedSize <= 0 || expectedSize > 8 * 1024 * 1024)
    throw new Error("The selected document exceeds email attachment size limits.");
  const response = await drive.files.get(
    {
      fileId,
      alt: "media",
      supportsAllDrives: true,
    },
    { responseType: "stream", signal }
  );
  const stream = response.data as Readable;
  // Stop a changed/oversized remote file during download, before buffering it all.
  const limit = expectedSize;
  const bytes = Buffer.allocUnsafe(limit);
  let offset = 0;
  try {
    for await (const chunk of stream) {
      signal?.throwIfAborted();
      const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      if (offset + part.length > limit) throw new Error("ATTACHMENT_CHANGED");
      part.copy(bytes, offset);
      offset += part.length;
    }
    return bytes.subarray(0, offset);
  } finally {
    stream.destroy();
  }
}

/** Lightweight availability/revision check. Preview never downloads document bytes. */
export async function inspectDriveFile(fileId: string, signal?: AbortSignal) {
  const drive = driveClient();
  const response = await drive.files.get({ fileId, fields: "id,name,mimeType,size,trashed,md5Checksum,modifiedTime,version", supportsAllDrives: true }, { signal });
  const file = response.data;
  if (file.trashed || !file.id) throw Object.assign(new Error("The selected document is no longer available in Google Drive."), { code: 404 });
  return { id: file.id, mimeType: file.mimeType || "", fileSize: Number(file.size || 0),
    revision: file.md5Checksum || `${file.version || ""}:${file.modifiedTime || ""}`, checksum: file.md5Checksum || "" };
}

function driveIdFromLink(link: string) {
  const patterns = [
    /\/folders\/([a-zA-Z0-9_-]+)/,
    /\/file\/d\/([a-zA-Z0-9_-]+)/,
    /[?&]id=([a-zA-Z0-9_-]+)/,
    /\/d\/([a-zA-Z0-9_-]+)/,
  ];
  return patterns.map((pattern) => link.match(pattern)?.[1]).find(Boolean) || null;
}

export type MigratedDriveFile = {
  documentName: string;
  driveFileId: string;
  driveLink: string;
  driveRelativePath: string;
  mimeType?: string | null;
  fileSize: number;
};

export async function migrateDriveLink(input: {
  link: string;
  clientId: string;
  clientName: string;
}) {
  const sourceId = driveIdFromLink(input.link);
  if (!sourceId) throw new Error("This is not a supported Google Drive file or folder link.");
  const drive = driveClient();
  const destination = await clientFolder(drive, input.clientId, input.clientName);
  const source = await drive.files.get({
    fileId: sourceId,
    fields: "id,name,mimeType,size,trashed",
    supportsAllDrives: true,
  });
  if (source.data.trashed) throw new Error("The linked Drive item is in trash.");

  const copied: MigratedDriveFile[] = [];
  const copyFile = async (file: drive_v3.Schema$File, parentId: string, relativePath: string) => {
    if (!file.id) return;
    const result = await drive.files.copy({
      fileId: file.id,
      requestBody: { name: safeSegment(file.name || "Untitled"), parents: [parentId] },
      fields: "id,name,mimeType,size,webViewLink",
      supportsAllDrives: true,
    });
    if (!result.data.id) throw new Error(`Could not copy "${file.name || "file"}".`);
    copied.push({
      documentName: result.data.name || file.name || "Untitled",
      driveFileId: result.data.id,
      driveLink: result.data.webViewLink || `https://drive.google.com/file/d/${result.data.id}/view`,
      driveRelativePath: relativePath,
      mimeType: result.data.mimeType,
      fileSize: Number(result.data.size || file.size || 0),
    });
  };

  const copyFolder = async (folder: drive_v3.Schema$File, parentId: string, prefix: string) => {
    if (!folder.id) return;
    const folderName = safeSegment(folder.name || "Imported folder");
    const targetFolder = await ensureFolder(drive, folderName, parentId);
    let pageToken: string | undefined;
    do {
      const children = await drive.files.list({
        q: `'${escapeDriveQuery(folder.id)}' in parents and trashed=false`,
        fields: "nextPageToken,files(id,name,mimeType,size)",
        pageSize: 1000,
        pageToken,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });
      for (const child of children.data.files || []) {
        const childPath = `${prefix}${folderName}/${child.name || "Untitled"}`;
        if (child.mimeType === FOLDER_MIME) await copyFolder(child, targetFolder, `${prefix}${folderName}/`);
        else await copyFile(child, targetFolder, childPath);
      }
      pageToken = children.data.nextPageToken || undefined;
    } while (pageToken);
  };

  if (source.data.mimeType === FOLDER_MIME) await copyFolder(source.data, destination, "");
  else await copyFile(source.data, destination, source.data.name || "Untitled");
  return copied;
}
