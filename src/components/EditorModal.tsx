'use client';

import { useRef, useState, useEffect } from 'react';
import { X, Eye, Save, ImagePlus } from 'lucide-react';
import { formatDate, type TemplateDef } from '@/lib/templates';
import type { FolderType, TemplateType } from '@prisma/client';

export type ExistingDoc = {
  id: string;
  filename: string;
  contentHtml: string; // JSON form data
  logoBase64?: string | null;
  template: TemplateType;
  folder: FolderType;
};

type Props = {
  template: TemplateDef;
  existingDoc?: ExistingDoc;
  onClose: () => void;
  onSaved: () => void;
};

const DRAFT_KEY = (id: string) => `iconform_draft_${id}`;

function loadDraft(templateId: string): { data: Record<string, string>; filename: string; logo: string | null } | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY(templateId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveDraft(templateId: string, data: Record<string, string>, filename: string, logo: string | null) {
  try {
    localStorage.setItem(DRAFT_KEY(templateId), JSON.stringify({ data, filename, logo }));
  } catch { /* storage full — ignore */ }
}

function clearDraft(templateId: string) {
  try { localStorage.removeItem(DRAFT_KEY(templateId)); } catch { /* ignore */ }
}

function initialData(template: TemplateDef, existingDoc?: ExistingDoc): Record<string, string> {
  let saved: Record<string, string> = {};
  if (existingDoc) {
    try {
      saved = JSON.parse(existingDoc.contentHtml);
    } catch {
      saved = {};
    }
  }
  const out: Record<string, string> = {};
  for (const f of template.fields) {
    out[f.name] = saved[f.name] ?? f.default ?? '';
  }
  return out;
}

export default function EditorModal({ template, existingDoc, onClose, onSaved }: Props) {
  const draft = !existingDoc ? loadDraft(template.id) : null;
  const dirtyRef = useRef(!!(existingDoc || draft?.filename));
  const [data, setData] = useState<Record<string, string>>(() =>
    draft?.data ?? initialData(template, existingDoc)
  );
  const [logo, setLogo] = useState<string | null>(draft?.logo ?? existingDoc?.logoBase64 ?? null);
  const [filename, setFilename] = useState(draft?.filename ?? existingDoc?.filename ?? '');
  const [pages, setPages] = useState<string[]>([]);
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Escape to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  function setField(name: string, value: string) {
    setData((prev) => {
      const next = { ...prev, [name]: value };
      const f = template.fields.find((x) => x.name === name);
      if (f?.type === 'date' && f.dateMaps) {
        for (const [tag, kind] of Object.entries(f.dateMaps)) {
          next[tag] = value ? formatDate(kind, value) : '';
        }
      }
      if (!dirtyRef.current) {
        const suggested = template.suggestName(next);
        if (suggested) setFilename(suggested);
      }
      if (!existingDoc) saveDraft(template.id, next, filename, logo);
      return next;
    });
  }

  function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const newLogo = ev.target?.result as string;
      setLogo(newLogo);
      if (!existingDoc) saveDraft(template.id, data, filename, newLogo);
    };
    reader.readAsDataURL(file);
  }

  // ttd/stempel live inside `data` → fill the {%ttd}/{%stempel} tags and
  // persist via contentHtml with zero API changes. Normalized to PNG via
  // canvas (pdf-lib stamping only takes PNG/JPG); a default position is set
  // so the mark is draggable in the preview right away.
  function handleImageField(e: React.ChangeEvent<HTMLInputElement>, key: 'ttd' | 'stempel') {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      c.getContext('2d')!.drawImage(img, 0, 0);
      setData((prev) => ({
        ...prev,
        [key]: c.toDataURL('image/png'),
        [key + 'Pos']: prev[key + 'Pos'] || (key === 'ttd' ? '1,0.60,0.72' : '1,0.64,0.78'),
        [key + 'Size']: prev[key + 'Size'] || '1',
      }));
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }

  function parsePos(s: string | undefined): { page: number; x: number; y: number } | null {
    const m = /^(\d+),([\d.]+),([\d.]+)$/.exec(s ?? '');
    return m ? { page: +m[1], x: +m[2], y: +m[3] } : null;
  }

  function startResize(e: React.PointerEvent<HTMLDivElement>, key: 'ttd' | 'stempel') {
    e.preventDefault();
    e.stopPropagation();
    const startY = e.clientY;
    const startScale = parseFloat(data[key + 'Size'] || '1');
    function move(ev: PointerEvent) {
      const next = Math.max(0.3, startScale + (ev.clientY - startY) / 45);
      setData((prev) => ({ ...prev, [key + 'Size']: next.toFixed(3) }));
    }
    function up() {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    }
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  function startDrag(e: React.PointerEvent<HTMLImageElement>, key: 'ttd' | 'stempel', page: number) {
    e.preventDefault();
    // parentElement = wrapper div; parentElement.parentElement = page container
    const wrap = e.currentTarget.parentElement!.parentElement!;
    const mr = e.currentTarget.getBoundingClientRect();
    const dx = e.clientX - mr.left;
    const dy = e.clientY - mr.top;
    function move(ev: PointerEvent) {
      const r = wrap.getBoundingClientRect();
      const x = Math.min(Math.max((ev.clientX - dx - r.left) / r.width, 0), 0.98);
      const y = Math.min(Math.max((ev.clientY - dy - r.top) / r.height, 0), 0.98);
      setData((prev) => ({ ...prev, [key + 'Pos']: `${page},${x.toFixed(4)},${y.toFixed(4)}` }));
    }
    function up() {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    }
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  function handleFilenameChange(e: React.ChangeEvent<HTMLInputElement>) {
    dirtyRef.current = true;
    setFilename(e.target.value);
    if (!existingDoc) saveDraft(template.id, data, e.target.value, logo);
  }

  async function handlePreview() {
    setPreviewing(true);
    setError('');
    try {
      const res = await fetch('/api/documents/preview?format=pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template: template.id, data, logo }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      const json = await res.json();
      setPages(json.pages as string[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal membuat preview.');
    } finally {
      setPreviewing(false);
    }
  }

  async function handleSave() {
    const name = filename.trim();
    if (!name) { setError('Nama file tidak boleh kosong.'); return; }

    setSaving(true);
    setError('');
    try {
      const url = existingDoc ? `/api/documents/${existingDoc.id}` : '/api/documents';
      const method = existingDoc ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: name, template: template.id, data, logo }),
      });

      if (!res.ok) {
        const resData = await res.json().catch(() => ({}));
        throw new Error(resData.error ?? `HTTP ${res.status}`);
      }

      clearDraft(template.id);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan dokumen.');
    } finally {
      setSaving(false);
    }
  }

  const folderLabel = template.folder === 'SURAT_TUGAS' ? 'Folder Surat Tugas' : 'Folder Berita Acara';

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-5xl max-h-[92vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <h2 className="font-bold text-slate-800">{template.label}</h2>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              template.folder === 'SURAT_TUGAS' ? 'bg-amber-100 text-amber-700' : 'bg-sky-100 text-sky-700'
            }`}>
              {folderLabel}
            </span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Form */}
          <div className="space-y-3">
            {template.fields.map((f) => (
              <div key={f.name}>
                <label className="block text-xs font-medium text-slate-600 mb-0.5">{f.label}</label>
                {f.multiline ? (
                  <textarea
                    value={data[f.name] ?? ''}
                    onChange={(e) => setField(f.name, e.target.value)}
                    rows={2}
                    className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
                  />
                ) : (
                  <input
                    type={f.type === 'date' ? 'date' : 'text'}
                    value={data[f.name] ?? ''}
                    onChange={(e) => setField(f.name, e.target.value)}
                    className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
                  />
                )}
              </div>
            ))}

            {!template.noSignature && ([['ttd', 'Upload Tanda Tangan'], ['stempel', 'Upload Stempel']] as const).map(([key, label]) => (
              <div key={key} className="border-t pt-3">
                <label className="flex items-center gap-2 text-sm font-medium text-slate-600 cursor-pointer w-fit">
                  <ImagePlus size={16} />
                  {label}
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => handleImageField(e, key)} />
                </label>
                <p className="text-xs text-slate-400 mt-0.5">Muncul di posisi tanda tangan dokumen.</p>
                {data[key] && (
                  <div className="mt-2 flex items-center gap-3">
                    <img src={data[key]} alt={label} className="max-h-16 border rounded" />
                    <button
                      type="button"
                      onClick={() => setField(key, '')}
                      className="text-xs text-red-500 hover:text-red-600"
                    >
                      Hapus
                    </button>
                  </div>
                )}
              </div>
            ))}

            {template.allowLogo && (
              <div className="border-t pt-3">
                <label className="flex items-center gap-2 text-sm font-medium text-slate-600 cursor-pointer w-fit">
                  <ImagePlus size={16} />
                  Upload Logo Pihak Kedua
                  <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                </label>
                <p className="text-xs text-slate-400 mt-0.5">
                  Logo disimpan bersama dokumen di folder Drive khusus BA ini.
                </p>
                {logo && <img src={logo} alt="Logo Pihak Kedua" className="mt-2 max-h-16 border rounded" />}
              </div>
            )}
          </div>

          {/* Preview + save panel */}
          <div className="space-y-4">
            <div className="overflow-auto border-2 border-dashed border-slate-300 rounded-lg bg-slate-50 h-[480px]">
              {pages.length ? pages.map((src, pi) => {
                const pageNum = pi + 1;
                return (
                  <div key={pi} className="relative" style={{ userSelect: 'none' }}>
                    <img src={src} className="w-full block" alt={`Halaman ${pageNum}`} />
                    {!template.noSignature && (['ttd', 'stempel'] as const).map((key) => {
                      const pos = parsePos(data[key + 'Pos']);
                      if (!pos || pos.page !== pageNum || !data[key]) return null;
                      const h = 45 * parseFloat(data[key + 'Size'] || '1');
                      return (
                        <div
                          key={key}
                          className="absolute"
                          style={{ left: `${pos.x * 100}%`, top: `${pos.y * 100}%`, touchAction: 'none' }}
                        >
                          <img
                            src={data[key]}
                            className="block cursor-grab active:cursor-grabbing"
                            style={{ height: `${h}px`, width: 'auto' }}
                            onPointerDown={(e) => startDrag(e, key, pageNum)}
                            alt={key}
                            draggable={false}
                          />
                          <div
                            className="absolute bottom-0 right-0 w-3 h-3 bg-sky-500/70 rounded-sm cursor-se-resize"
                            onPointerDown={(e) => startResize(e, key)}
                          />
                        </div>
                      );
                    })}
                  </div>
                );
              }) : (
                <p className="text-sm text-slate-400 px-6 text-center pt-6">
                  Isi formulir lalu klik <b>Preview</b> — dokumen dirender dari template asli
                  (hasil 100% sama dengan file Word/PDF final).
                </p>
              )}
            </div>
            <button
              onClick={handlePreview}
              disabled={previewing}
              className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg border border-sky-300 text-sky-700 hover:bg-sky-50 disabled:opacity-60"
            >
              <Eye size={14} />
              {previewing ? 'Merender…' : 'Preview'}
            </button>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
              <div>
                <label className="block text-sm font-medium text-blue-800 mb-1">
                  Nama File Hasil Dokumen
                </label>
                <input
                  type="text"
                  value={filename}
                  onChange={handleFilenameChange}
                  className="w-full border border-blue-300 rounded px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400"
                  placeholder="Nama file akan terisi otomatis…"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-blue-800 mb-1">
                  Folder Tujuan Otomatis
                </label>
                <input
                  type="text"
                  readOnly
                  value={folderLabel}
                  className="w-full border border-blue-200 rounded px-3 py-1.5 text-sm bg-blue-100 text-blue-700 cursor-default"
                />
              </div>
            </div>

            {error && <p className="text-red-600 text-sm">{error}</p>}

            <div className="flex justify-end gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-5 py-2 text-sm rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-semibold transition-colors"
              >
                <Save size={14} />
                {saving ? 'Menyimpan…' : 'Simpan ke Folder'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
