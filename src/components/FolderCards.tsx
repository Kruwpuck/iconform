import { FolderOpen } from 'lucide-react';
import type { FolderType } from '@prisma/client';

type Props = {
  counts: { ST: number; BA: number };
  activeFolder: FolderType | null;
  onFilter: (f: FolderType | null) => void;
};

export default function FolderCards({ counts, activeFolder, onFilter }: Props) {
  function toggle(f: FolderType) {
    onFilter(activeFolder === f ? null : f);
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <button
        type="button"
        onClick={() => toggle('SURAT_TUGAS')}
        className={`text-left rounded-xl border-2 p-4 transition-colors ${
          activeFolder === 'SURAT_TUGAS'
            ? 'border-amber-400 bg-amber-100 ring-2 ring-amber-300'
            : 'border-amber-200 bg-amber-50 hover:bg-amber-100'
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
        type="button"
        onClick={() => toggle('BERITA_ACARA')}
        className={`text-left rounded-xl border-2 p-4 transition-colors ${
          activeFolder === 'BERITA_ACARA'
            ? 'border-sky-400 bg-sky-100 ring-2 ring-sky-300'
            : 'border-sky-200 bg-sky-50 hover:bg-sky-100'
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
  );
}
