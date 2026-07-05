'use client';

import { FolderOpen } from 'lucide-react';
import type { FolderType } from '@prisma/client';

type Props = {
  counts: { ST: number; BA: number };
  activeFolder: FolderType | null;
  onFilter: (f: FolderType | null) => void;
};

export default function FolderCards({ counts, activeFolder, onFilter }: Props) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <button
          onClick={() => onFilter(activeFolder === 'SURAT_TUGAS' ? null : 'SURAT_TUGAS')}
          className={`text-left rounded-xl border-2 p-4 transition-all ${
            activeFolder === 'SURAT_TUGAS'
              ? 'border-amber-500 bg-amber-50'
              : 'border-amber-200 bg-amber-50 hover:border-amber-400'
          }`}
        >
          <div className="flex items-center gap-2 mb-1">
            <FolderOpen size={20} className="text-amber-600" />
            <span className="font-semibold text-amber-800">Folder Surat Tugas</span>
          </div>
          <p className="text-2xl font-bold text-amber-700">{counts.ST}</p>
          <p className="text-xs text-amber-600">dokumen tersimpan</p>
        </button>

        <button
          onClick={() => onFilter(activeFolder === 'BERITA_ACARA' ? null : 'BERITA_ACARA')}
          className={`text-left rounded-xl border-2 p-4 transition-all ${
            activeFolder === 'BERITA_ACARA'
              ? 'border-sky-500 bg-sky-50'
              : 'border-sky-200 bg-sky-50 hover:border-sky-400'
          }`}
        >
          <div className="flex items-center gap-2 mb-1">
            <FolderOpen size={20} className="text-sky-600" />
            <span className="font-semibold text-sky-800">Folder Berita Acara</span>
          </div>
          <p className="text-2xl font-bold text-sky-700">{counts.BA}</p>
          <p className="text-xs text-sky-600">dokumen tersimpan</p>
        </button>
      </div>

      {activeFolder && (
        <button
          onClick={() => onFilter(null)}
          className="text-sm text-slate-500 hover:text-slate-700 underline"
        >
          Tampilkan Semua Folder
        </button>
      )}
    </div>
  );
}
