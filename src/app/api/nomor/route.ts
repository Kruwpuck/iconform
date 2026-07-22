import { NextResponse } from 'next/server';
import { readNomorList } from '@/lib/sheets';

// ponytail: 60s cache — nomor list changes infrequently, avoids per-keystroke Sheets API call
export const revalidate = 60;

export async function GET() {
  try {
    const list = await readNomorList();
    return NextResponse.json(list);
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}
