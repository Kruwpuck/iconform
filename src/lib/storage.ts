import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { randomUUID } from 'crypto';

const DATA_DIR = process.env.STORAGE_DIR ?? '/app/data';

function ensureDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export async function uploadFile(
  name: string,
  _mime: string,
  buffer: Buffer,
  _folderId: string
): Promise<{ id: string; webViewLink: string }> {
  ensureDir();
  const ext = name.split('.').pop() ?? 'bin';
  const id = `${randomUUID()}.${ext}`;
  fs.writeFileSync(path.join(DATA_DIR, id), buffer);
  return { id, webViewLink: '' };
}

export async function deleteFile(fileId: string): Promise<void> {
  try {
    fs.unlinkSync(path.join(DATA_DIR, fileId));
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw err;
  }
}

export async function streamFile(fileId: string): Promise<Readable> {
  return fs.createReadStream(path.join(DATA_DIR, fileId));
}
