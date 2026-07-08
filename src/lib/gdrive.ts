import { google } from 'googleapis';
import { Readable } from 'stream';

function getDriveClient() {
  const clientId = process.env.GDRIVE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GDRIVE_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.GDRIVE_OAUTH_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken)
    throw new Error('GDRIVE_OAUTH_CLIENT_ID / GDRIVE_OAUTH_CLIENT_SECRET / GDRIVE_OAUTH_REFRESH_TOKEN not set');

  // OAuth user credentials — uploads count against the user's own Drive quota.
  // Service accounts have no storage quota on personal (non-Workspace) accounts.
  const oauth2 = new google.auth.OAuth2(clientId, clientSecret);
  oauth2.setCredentials({ refresh_token: refreshToken });
  return google.drive({ version: 'v3', auth: oauth2 });
}

export async function uploadFile(
  name: string,
  mime: string,
  buffer: Buffer,
  folderId: string
): Promise<{ id: string; webViewLink: string }> {
  const drive = getDriveClient();
  const res = await drive.files.create({
    supportsAllDrives: true,
    requestBody: { name, parents: [folderId] },
    media: { mimeType: mime, body: Readable.from(buffer) },
    fields: 'id, webViewLink',
  });
  return {
    id: res.data.id!,
    webViewLink: res.data.webViewLink!,
  };
}

export async function deleteFile(fileId: string): Promise<void> {
  try {
    const drive = getDriveClient();
    await drive.files.delete({ fileId, supportsAllDrives: true });
  } catch (err: unknown) {
    const code = (err as { code?: number; status?: number })?.code ?? (err as { code?: number; status?: number })?.status;
    if (code === 404) return; // already deleted, swallow
    throw err;
  }
}

/** Find-or-create a subfolder by name. ponytail: no lock — concurrent saves may
 * create duplicate folders; single-user app, acceptable. */
export async function ensureFolder(name: string, parentId: string): Promise<string> {
  const drive = getDriveClient();
  const escaped = name.replace(/'/g, "\\'");
  const res = await drive.files.list({
    q: `name = '${escaped}' and '${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id)',
    pageSize: 1,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  const existing = res.data.files?.[0]?.id;
  if (existing) return existing;
  const created = await drive.files.create({
    supportsAllDrives: true,
    requestBody: { name, parents: [parentId], mimeType: 'application/vnd.google-apps.folder' },
    fields: 'id',
  });
  return created.data.id!;
}

/** Drive folder per template id (user-provided); falls back per FolderType. */
export function resolveFolderId(templateId: string, folder: string): string | undefined {
  const perTemplate: Record<string, string | undefined> = {
    BAI: process.env.GDRIVE_FOLDER_BAI_ID,
    UID_JABAR: process.env.GDRIVE_FOLDER_BAI_ID,
    BAKL: process.env.GDRIVE_FOLDER_BAKL_ID,
    BA_PENGUJIAN: process.env.GDRIVE_FOLDER_BA_PENGUJIAN_ID,
    BAP: process.env.GDRIVE_FOLDER_BAP_ID,
    BAST: process.env.GDRIVE_FOLDER_BAST_ID,
    NODIN: process.env.GDRIVE_FOLDER_NODIN_ID,
  };
  const perFolder: Record<string, string | undefined> = {
    SURAT_TUGAS: process.env.GDRIVE_FOLDER_SURAT_TUGAS_ID,
    BERITA_ACARA: process.env.GDRIVE_FOLDER_BERITA_ACARA_ID,
  };
  return perTemplate[templateId] ?? perFolder[folder];
}

/** BA Pengujian: per-document subfolder holding the doc + partner logo. */
export async function prepareTargetFolder(
  templateId: string,
  folder: string,
  filename: string,
  logo?: string | null
): Promise<string | undefined> {
  let folderId = resolveFolderId(templateId, folder);
  if (!folderId) return undefined;
  if (templateId === 'BA_PENGUJIAN') {
    folderId = await ensureFolder(filename, folderId);
    const m = logo?.match(/^data:(image\/[\w+.-]+);base64,(.+)$/);
    if (m) {
      const ext = m[1].split('/')[1].replace(/[^a-z0-9]/gi, '');
      await uploadFile(`logo.${ext}`, m[1], Buffer.from(m[2], 'base64'), folderId);
    }
  }
  return folderId;
}

/** name + parent of a file — used to clean up per-document folders on delete. */
export async function getFileMeta(fileId: string): Promise<{ name: string; parents: string[] } | null> {
  try {
    const drive = getDriveClient();
    const res = await drive.files.get({ fileId, fields: 'name, parents', supportsAllDrives: true });
    return { name: res.data.name ?? '', parents: res.data.parents ?? [] };
  } catch {
    return null;
  }
}

export async function streamFile(fileId: string): Promise<Readable> {
  const drive = getDriveClient();
  const res = await drive.files.get(
    { fileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'stream' }
  );
  return res.data as Readable;
}
