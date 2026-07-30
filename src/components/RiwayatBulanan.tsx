'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { FileDown, FileText, History, Search } from 'lucide-react';
import type { Document, FolderType } from '@prisma/client';

const MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

type Props = {
  folder: FolderType | null;
};

/** Compact "recent documents by month" summary for the dashboard — lighter than
 * DocumentsTable (no pagination/edit/delete), with folder/search/month filtering. */
export default function RiwayatBulanan({ folder }: Props) {
  const currentMonth = useMemo(() => new Date().toISOString().slice(0, 7), []);
  const [month, setMonth] = useState(currentMonth);
  const [months, setMonths] = useState<string[]>([currentMonth]);
  const [search, setSearch] = useState('');
  const [docs, setDocs] = useState<Document[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  // Populate the month dropdown from months that actually have documents (unlimited years).
  useEffect(() => {
    fetch('/api/documents?distinctMonths=1')
      .then((r) => r.json())
      .then((data: { months: string[] }) => {
        const set = new Set(data.months ?? []);
        set.add(currentMonth);
        setMonths(Array.from(set).sort().reverse());
      })
      .catch(() => {});
  }, [currentMonth]);

  const fetchDocs = useCallback(async (m: string, f: FolderType | null) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ month: m, pageSize: '50' });
      if (f) params.set('folder', f);
      const res = await fetch(`/api/documents?${params}`);
      if (!res.ok) return;
      const data = await res.json();
      setDocs(data.items);
      setTotal(data.total);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDocs(month, folder);
  }, [month, folder, fetchDocs]);

  const filteredDocs = docs.filter((d) =>
    d.filename.toLowerCase().includes(search.trim().toLowerCase())
  );

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="p-4 border-b flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-slate-700 font-semibold text-sm shrink-0">
          <History size={16} />
          Riwayat Dokumen
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          {loading && <span className="text-xs text-slate-400 shrink-0">Memuat…</span>}
          <div className="relative flex-1 sm:flex-none">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama berkas…"
              className="w-full sm:w-56 border border-slate-300 rounded-lg pl-8 pr-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
            />
          </div>
          <select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
          >
            {months.map((m) => (
              <option key={m} value={m}>{monthLabel(m)}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left px-4 py-2.5">Nama Berkas</th>
              <th className="text-left px-4 py-2.5">Lokasi Folder</th>
              <th className="text-left px-4 py-2.5">Tanggal Diarsip</th>
              <th className="text-left px-4 py-2.5">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredDocs.length === 0 ? (
              <tr>
                <td colSpan={4} className="text-center text-slate-400 py-8">
                  Tidak ada dokumen diarsip pada bulan ini.
                </td>
              </tr>
            ) : (
              filteredDocs.map((doc) => (
                <tr key={doc.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-2.5 font-medium text-slate-800">{doc.filename}</td>
                  <td className="px-4 py-2.5 text-slate-500">
                    {doc.folder === 'SURAT_TUGAS' ? 'Folder Surat Tugas' : 'Folder Berita Acara'}
                  </td>
                  <td className="px-4 py-2.5 text-slate-500">
                    {new Date(doc.createdAt).toLocaleDateString('id-ID', { dateStyle: 'long' })}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1">
                      <a
                        href={`/api/documents/${doc.id}/download?type=pdf`}
                        download={doc.filename + '.pdf'}
                        className="p-1.5 rounded hover:bg-red-50 text-red-500 hover:text-red-600"
                        title="Download PDF"
                      >
                        <FileDown size={15} />
                      </a>
                      <a
                        href={`/api/documents/${doc.id}/download?type=docx`}
                        download={doc.filename + '.docx'}
                        className="p-1.5 rounded hover:bg-blue-50 text-blue-500 hover:text-blue-600"
                        title="Download DOCX"
                      >
                        <FileText size={15} />
                      </a>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="px-4 py-2.5 border-t text-xs text-slate-500">
        {total} dokumen diarsip bulan ini
      </div>
    </div>
  );
}
