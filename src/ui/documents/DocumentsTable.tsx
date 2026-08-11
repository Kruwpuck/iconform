'use client';

import { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import { FileDown, FileText, Pencil, Trash2, ArrowUp, ArrowDown } from 'lucide-react';
import type { Document, FolderType, TemplateType } from '@prisma/client';
import type { ExistingDoc } from './EditorModal';

type Props = {
  activeFolder: FolderType | null;
  activeTemplate?: TemplateType | null;
  onEditDoc: (doc: ExistingDoc) => void;
  onCountsChange: (counts: { ST: number; BA: number }) => void;
};

export type TableHandle = { refresh: () => void };

const DocumentsTable = forwardRef<TableHandle, Props>(function DocumentsTable(
  { activeFolder, activeTemplate, onEditDoc, onCountsChange },
  ref
) {
  const [docs, setDocs] = useState<Document[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'createdAt' | 'filename'>('createdAt');
  const [dir, setDir] = useState<'asc' | 'desc'>('desc');
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const PAGE_SIZE = 10;

  const fetchDocs = useCallback(
    async (searchVal: string, pageVal: number, folder: FolderType | null) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          search: searchVal,
          page: String(pageVal),
          pageSize: String(PAGE_SIZE),
          sort,
          dir,
          ...(folder ? { folder } : {}),
          ...(activeTemplate ? { template: activeTemplate } : {}),
        });
        const res = await fetch(`/api/documents?${params}`);
        if (!res.ok) return;
        const data = await res.json();
        setDocs(data.items);
        setTotal(data.total);

        // Fetch counts for both folders
        const [stRes, baRes] = await Promise.all([
          fetch('/api/documents?pageSize=1&folder=SURAT_TUGAS'),
          fetch('/api/documents?pageSize=1&folder=BERITA_ACARA'),
        ]);
        const stData = await stRes.json();
        const baData = await baRes.json();
        onCountsChange({ ST: stData.total ?? 0, BA: baData.total ?? 0 });
      } finally {
        setLoading(false);
      }
    },
    [onCountsChange, sort, dir]
  );

  useEffect(() => {
    fetchDocs(search, page, activeFolder);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, activeFolder, sort, dir]);

  useImperativeHandle(ref, () => ({
    refresh: () => fetchDocs(search, page, activeFolder),
  }));

  function handleSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setSearch(val);
    setPage(1);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchDocs(val, 1, activeFolder), 300);
  }

  async function handleDelete(doc: Document) {
    if (!window.confirm(`Hapus dokumen "${doc.filename}"?`)) return;
    const res = await fetch(`/api/documents/${doc.id}`, { method: 'DELETE' });
    if (res.ok) fetchDocs(search, page, activeFolder);
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  /** Clickable column header: same column toggles asc/desc, new column starts
   *  A→Z for names and newest-first for dates. */
  function SortHeader({ col, label }: { col: 'createdAt' | 'filename'; label: string }) {
    const active = sort === col;
    return (
      <button
        type="button"
        onClick={() => {
          setPage(1);
          if (active) setDir(dir === 'asc' ? 'desc' : 'asc');
          else { setSort(col); setDir(col === 'filename' ? 'asc' : 'desc'); }
        }}
        title={`Urutkan ${label}`}
        className={`inline-flex items-center gap-1 uppercase tracking-wide ${active ? 'text-sky-600' : 'hover:text-slate-800'}`}
      >
        {label}
        {active ? (
          dir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />
        ) : (
          <ArrowDown size={12} className="opacity-25" />
        )}
      </button>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      {/* Search bar */}
      <div className="p-4 border-b flex items-center justify-between gap-3">
        <input
          type="search"
          value={search}
          onChange={handleSearchChange}
          placeholder="Cari nama berkas…"
          className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm w-full max-w-xs focus:outline-none focus:ring-2 focus:ring-sky-400"
        />
        {loading && <span className="text-xs text-slate-400">Memuat…</span>}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left px-4 py-3">
                <SortHeader col="filename" label="Nama Berkas" />
              </th>
              <th className="text-left px-4 py-3">Lokasi Folder</th>
              <th className="text-left px-4 py-3">
                <SortHeader col="createdAt" label="Tanggal Diarsip" />
              </th>
              <th className="text-left px-4 py-3">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {docs.length === 0 ? (
              <tr>
                <td colSpan={4} className="text-center text-slate-400 py-10">
                  Belum ada surat yang dibuat…
                </td>
              </tr>
            ) : (
              docs.map((doc) => (
                <tr key={doc.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-800">{doc.filename}</td>
                  <td className="px-4 py-3 text-slate-500">
                    {doc.folder === 'SURAT_TUGAS' ? 'Folder Surat Tugas' : 'Folder Berita Acara'}
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {new Date(doc.createdAt).toLocaleDateString('id-ID', { dateStyle: 'long' })}
                  </td>
                  <td className="px-4 py-3">
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
                      <button
                        onClick={() =>
                          onEditDoc({
                            id: doc.id,
                            filename: doc.filename,
                            contentHtml: doc.contentHtml,
                            logoBase64: doc.logoBase64,
                            template: doc.template,
                            folder: doc.folder,
                          })
                        }
                        className="p-1.5 rounded hover:bg-amber-50 text-amber-500 hover:text-amber-600"
                        title="Edit"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        onClick={() => handleDelete(doc)}
                        className="p-1.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-500"
                        title="Hapus"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="px-4 py-3 border-t flex items-center justify-between text-sm text-slate-500">
        <span>{total} dokumen</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-3 py-1 rounded border border-slate-200 disabled:opacity-40 hover:bg-slate-50"
          >
            ← Prev
          </button>
          <span>Halaman {page} dari {totalPages}</span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="px-3 py-1 rounded border border-slate-200 disabled:opacity-40 hover:bg-slate-50"
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
});

export default DocumentsTable;
