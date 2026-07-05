'use client';

import { ArrowRight } from 'lucide-react';
import { TEMPLATES, type TemplateDef } from '@/lib/templates';

type Props = { onSelect: (t: TemplateDef) => void };

export default function TemplateGrid({ onSelect }: Props) {
  return (
    <div>
      <h2 className="text-base font-semibold text-slate-700 mb-3">Buat Dokumen Baru</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {TEMPLATES.map((t) => {
          const isST = t.folder === 'SURAT_TUGAS';
          return (
            <div
              key={t.id}
              className={`rounded-xl border p-4 flex flex-col gap-2 ${
                isST
                  ? 'bg-amber-50 border-amber-200'
                  : 'bg-sky-50 border-sky-200'
              }`}
            >
              <div>
                <p className={`font-semibold text-sm ${isST ? 'text-amber-800' : 'text-sky-800'}`}>
                  {t.label}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">{t.description}</p>
              </div>
              <button
                onClick={() => onSelect(t)}
                className={`mt-auto flex items-center gap-1 text-xs font-medium w-fit px-3 py-1.5 rounded-lg transition-colors ${
                  isST
                    ? 'bg-amber-500 hover:bg-amber-600 text-white'
                    : 'bg-sky-500 hover:bg-sky-600 text-white'
                }`}
              >
                Gunakan Template
                <ArrowRight size={12} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
