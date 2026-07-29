import { Readable } from "node:stream";
import { google, drive_v3 } from "googleapis";

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
  const auth = new google.auth.OAuth2(clientId, clientSecret);
  auth.setCredentials({ refresh_token: refreshToken });
  return google.drive({ version: "v3", auth });
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
