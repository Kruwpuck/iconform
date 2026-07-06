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

export async function streamFile(fileId: string): Promise<Readable> {
  const drive = getDriveClient();
  const res = await drive.files.get(
    { fileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'stream' }
  );
  return res.data as Readable;
}
