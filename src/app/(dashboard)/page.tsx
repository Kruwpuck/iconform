'use client';

import { useState, useEffect } from 'react';
import FolderCards from '@/components/FolderCards';
import RiwayatBulanan from '@/components/RiwayatBulanan';
import type { FolderType } from '@prisma/client';

export default function DashboardPage() {
  const [counts, setCounts] = useState({ ST: 0, BA: 0 });
  const [activeFolder, setActiveFolder] = useState<FolderType | null>(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/documents?pageSize=1&folder=SURAT_TUGAS').then((r) => r.json()),
      fetch('/api/documents?pageSize=1&folder=BERITA_ACARA').then((r) => r.json()),
    ]).then(([st, ba]) => setCounts({ ST: st.total ?? 0, BA: ba.total ?? 0 }));
  }, []);

  return (
    <div className="space-y-6 w-full">
      {/* Hero — PLN Icon Plus SBU Regional Jawa Barat brand banner */}
      <div className="relative overflow-hidden rounded-2xl bg-blue-950 px-8 py-10 shadow-lg">
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(115deg, #0a1e42 0%, #0a1e42 40%, #0891b2 75%, #06b6d4 100%)',
          }}
        />
        <div
          className="absolute -right-10 -top-16 h-64 w-64 rotate-12 opacity-20"
          style={{ background: '#facc15' }}
        />
        <div
          className="absolute -bottom-20 right-24 h-56 w-56 -rotate-12 opacity-10"
          style={{ background: '#facc15' }}
        />
        <div className="relative flex items-center gap-6">
          <img src="/icon2.png" alt="PLN Icon Plus" className="h-16 w-auto drop-shadow-lg" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-sky-300">
              PLN Icon Plus &mdash; SBU Regional Jawa Barat
            </p>
            <h1 className="text-3xl font-bold text-white">Dashboard PDL FORM</h1>
            <p className="mt-1 text-sm text-blue-200">
              Sistem pembuatan &amp; pengarsipan Surat Tugas dan Berita Acara.
            </p>
          </div>
        </div>
      </div>

      <FolderCards counts={counts} activeFolder={activeFolder} onFilter={setActiveFolder} />

      <RiwayatBulanan folder={activeFolder} />
    </div>
  );
}
