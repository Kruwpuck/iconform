import { google } from 'googleapis';
import { Readable } from 'stream';

function getDriveClient() {
  const b64 = process.env.GDRIVE_SERVICE_ACCOUNT_B64;
  if (!b64) throw new Error('GDRIVE_SERVICE_ACCOUNT_B64 not set');

  const credentials = JSON.parse(Buffer.from(b64, 'base64').toString('utf-8'));
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
  return google.drive({ version: 'v3', auth });
}

export async function uploadFile(
  name: string,
  mime: string,
  buffer: Buffer,
  folderId: string
): Promise<{ id: string; webViewLink: string }> {
  const drive = getDriveClient();
  const res = await drive.files.create({
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
    await drive.files.delete({ fileId });
  } catch (err: unknown) {
    const code = (err as { code?: number; status?: number })?.code ?? (err as { code?: number; status?: number })?.status;
    if (code === 404) return; // already deleted, swallow
    throw err;
  }
}

export async function streamFile(fileId: string): Promise<Readable> {
  const drive = getDriveClient();
  const res = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'stream' }
  );
  return res.data as Readable;
}
