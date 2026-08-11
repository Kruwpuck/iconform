'use client';

import { useRef, useState, useEffect } from 'react';
import { X, Eye, Save, ImagePlus } from 'lucide-react';
import { formatDate, MARK_HEIGHT_PCT, type TemplateDef } from '@/domain/templates';
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
    try { saved = JSON.parse(existingDoc.contentHtml); } catch { saved = {}; }
  }
  const out: Record<string, string> = {};
  for (const f of template.fields) {
    out[f.name] = saved[f.name] ?? f.default ?? '';
  }
  // Re-expand date fields so derived tags (hari, tanggal, etc.) are populated on re-edit
  for (const f of template.fields) {
    if (f.type === 'date' && f.dateMaps && out[f.name]) {
      for (const [tag, kind] of Object.entries(f.dateMaps)) {
        if (!(tag in out)) out[tag] = formatDate(kind, out[f.name]);
      }
    }
  }
  // Carry forward repeat-group arrays (stored as JSON string in _group_* keys)
  for (const g of template.repeatGroups ?? []) {
    const key = `_group_${g.name}`;
    if (saved[key]) out[key] = saved[key];
    else {
      // Migrate legacy flat keys (material1/kendala1/nama1 etc.)
      const rows: Record<string, string>[] = [];
      for (let i = 1; i <= 10; i++) {
        const firstSf = g.subFields[0];
        const legacyKey = g.name === 'items' ? `${firstSf.name}${i}`
          : g.name === 'petugas' && 'nama1' in saved ? `nama${i}`
          : g.name === 'kendala' ? `kendala${i}`
          : null;
        if (!legacyKey || !saved[legacyKey]) break;
        const row: Record<string, string> = {};
        for (const sf of g.subFields) {
          const lk = g.name === 'petugas' && 'nama1' in saved ? `${sf.name}${i}` : `${sf.name}${i}`;
          row[sf.name] = saved[lk] ?? '';
        }
        rows.push(row);
      }
      if (rows.length) out[key] = JSON.stringify(rows);
    }
  }
  return out;
}

export default function EditorModal({ template, existingDoc, onClose, onSaved }: Props) {
  const draft = !existingDoc ? loadDraft(template.id) : null;
  const dirtyRef = useRef(!!existingDoc);
  const [data, setData] = useState<Record<string, string>>(() =>
    draft?.data ?? initialData(template, existingDoc)
  );
  const [logo, setLogo] = useState<string | null>(draft?.logo ?? existingDoc?.logoBase64 ?? null);
  const [filename, setFilename] = useState(draft?.filename ?? existingDoc?.filename ?? '');
  const [pages, setPages] = useState<string[]>([]);
  // A rendered preview only matches the saved PDF as long as no field changed
  // since: editing text reflows the body (and can push the signature block to a
  // second page), so a stale preview is exactly the "hasil simpan beda dari
  // preview" report. Dragging/resizing a mark does not reflow anything, so it
  // deliberately does not set this.
  const [stale, setStale] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [nomorList, setNomorList] = useState<string[]>([]);

  // Lazy-fetch nomor list only for templates that use it
  useEffect(() => {
    if (!template.fields.some((f) => f.name === 'nomor')) return;
    fetch('/api/nomor').then((r) => r.json()).then(setNomorList).catch(() => {});
  }, [template.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Escape to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  function setField(name: string, value: string) {
    setStale(true);
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
      setStale(true); // the mitra logo sits in the header — it reflows nothing
                      // below it, but the preview still has to show it
      // also register as a draggable mark so the partner logo can be positioned
      setData((prev) => ({
        ...prev,
        logoMitra: newLogo,
        logoMitraPos: prev.logoMitraPos || '1,0.60,0.60',
        logoMitraSize: prev.logoMitraSize || '1',
      }));
      if (!existingDoc) saveDraft(template.id, data, filename, newLogo);
    };
    reader.readAsDataURL(file);
  }

  // ttd/stempel live inside `data` → fill the {%ttd}/{%stempel} tags and
  // persist via contentHtml with zero API changes. Normalized to PNG via
  // canvas (pdf-lib stamping only takes PNG/JPG); a default position is set
  // so the mark is draggable in the preview right away.
  function handleImageField(e: React.ChangeEvent<HTMLInputElement>, key: 'ttd' | 'stempel' | 'ttd2' | 'stempel2' | 'logoMitra') {
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
        [key + 'Pos']: prev[key + 'Pos'] || (key === 'ttd' ? '1,0.60,0.72' : key === 'stempel' ? '1,0.64,0.78' : key === 'ttd2' ? '1,0.30,0.72' : '1,0.34,0.78'),
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

  function startResize(e: React.PointerEvent<HTMLDivElement>, key: 'ttd' | 'stempel' | 'ttd2' | 'stempel2' | 'logoMitra') {
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

  function startDrag(e: React.PointerEvent<HTMLImageElement>, key: 'ttd' | 'stempel' | 'ttd2' | 'stempel2' | 'logoMitra', page: number) {
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
      setStale(false);
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
                  <>
                    <input
                      type={f.type === 'date' ? 'date' : 'text'}
                      list={f.name === 'nomor' && nomorList.length ? 'nomor-datalist' : undefined}
                      value={data[f.name] ?? ''}
                      onChange={(e) => setField(f.name, e.target.value)}
                      className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
                    />
                    {f.name === 'nomor' && nomorList.length > 0 && (
                      <datalist id="nomor-datalist">
                        {nomorList.map((n) => <option key={n} value={n} />)}
                      </datalist>
                    )}
                  </>
                )}
              </div>
            ))}

            {/* Repeat groups (dynamic rows) */}
            {(template.repeatGroups ?? []).map((g) => {
              const groupKey = `_group_${g.name}`;
              let rows: Record<string, string>[] = [];
              try { rows = JSON.parse(data[groupKey] || '[]'); } catch { rows = []; }
              if (rows.length < (g.minRows ?? 1)) rows = [...rows, ...Array.from({ length: (g.minRows ?? 1) - rows.length }, () => ({}))];

              function setGroupRows(next: Record<string, string>[]) {
                const val = JSON.stringify(next);
                setStale(true);
                setData((prev) => {
                  const d = { ...prev, [groupKey]: val };
                  if (!existingDoc) saveDraft(template.id, d, filename, logo);
                  return d;
                });
              }
              // NODIN: auto-sum jumlahTotal per row and totalTagihan
              function setGroupField(idx: number, sfName: string, value: string) {
                const next = rows.map((r, i) => {
                  if (i !== idx) return r;
                  const updated = { ...r, [sfName]: value };
                  if (g.name === 'items') {
                    const v = parseFloat(updated.vol || '0');
                    const h = parseFloat((updated.hargaSatuan || '0').replace(/[,.]/g, ''));
                    if (!isNaN(v) && !isNaN(h)) updated.jumlahTotal = (v * h).toString();
                  }
                  return updated;
                });
                // NODIN: recompute totalTagihan
                if (g.name === 'items') {
                  const total = next.reduce((s, r) => s + parseFloat((r.jumlahTotal || '0').replace(/[,.]/g, '')), 0);
                  setStale(true);
                  setData((prev) => {
                    const d = { ...prev, [groupKey]: JSON.stringify(next), totalTagihan: total.toString() };
                    if (!existingDoc) saveDraft(template.id, d, filename, logo);
                    return d;
                  });
                  return;
                }
                setGroupRows(next);
              }

              return (
                <div key={g.name} className="border-t pt-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-semibold text-slate-700">{g.label}</p>
                    <div className="flex gap-1">
                      <button type="button" onClick={() => setGroupRows([...rows, {}])}
                        className="px-2 py-0.5 text-xs rounded bg-sky-100 text-sky-700 hover:bg-sky-200">+ Tambah</button>
                      {rows.length > (g.minRows ?? 1) && (
                        <button type="button" onClick={() => setGroupRows(rows.slice(0, -1))}
                          className="px-2 py-0.5 text-xs rounded bg-red-100 text-red-600 hover:bg-red-200">− Hapus</button>
                      )}
                    </div>
                  </div>
                  {rows.map((row, idx) => (
                    <div key={idx} className="mb-2 p-2 border border-slate-200 rounded bg-slate-50 space-y-1">
                      <p className="text-xs text-slate-400">{g.label} {idx + 1}</p>
                      {g.subFields.map((sf) => (
                        <div key={sf.name}>
                          <label className="block text-xs text-slate-500 mb-0.5">{sf.label}</label>
                          {sf.multiline ? (
                            <textarea value={row[sf.name] ?? ''} rows={2}
                              onChange={(e) => setGroupField(idx, sf.name, e.target.value)}
                              className="w-full border border-slate-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400" />
                          ) : (
                            <input type={sf.type === 'number' ? 'number' : 'text'} value={row[sf.name] ?? ''}
                              onChange={(e) => setGroupField(idx, sf.name, e.target.value)}
                              className="w-full border border-slate-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400" />
                          )}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              );
            })}

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

            {/* TTD pihak-2 (eksternal) */}
            {!template.noSignature && template.twoParties && (
              <div className="border-t pt-3">
                <p className="text-sm font-semibold text-slate-700 mb-2">Tanda Tangan Pihak Kedua</p>
                {([['ttd2', 'Upload TTD Pihak Kedua'], ['stempel2', 'Upload Stempel Pihak Kedua']] as const).map(([key, label]) => (
                  <div key={key} className="mb-2">
                    <label className="flex items-center gap-2 text-sm font-medium text-slate-600 cursor-pointer w-fit">
                      <ImagePlus size={16} />
                      {label}
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => handleImageField(e, key)} />
                    </label>
                    {data[key] && (
                      <div className="mt-1 flex items-center gap-3">
                        <img src={data[key]} alt={label} className="max-h-16 border rounded" />
                        <button type="button" onClick={() => setField(key, '')} className="text-xs text-red-500 hover:text-red-600">Hapus</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

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
                    {(['ttd', 'stempel', 'ttd2', 'stempel2', 'logoMitra'] as const).map((key) => {
                      if (template.noSignature && key !== 'logoMitra') return null;
                      const pos = parsePos(data[key + 'Pos']);
                      if (!pos || pos.page !== pageNum || !data[key]) return null;
                      // % of page height, not px — matches the pdf-lib stamp at
                      // any render scale (the page img is w-full, so its pixel
                      // size varies with viewport width)
                      const h = MARK_HEIGHT_PCT * parseFloat(data[key + 'Size'] || '1');
                      return (
                        <div
                          key={key}
                          className="absolute"
                          style={{ left: `${pos.x * 100}%`, top: `${pos.y * 100}%`, height: `${h}%`, touchAction: 'none' }}
                        >
                          <img
                            src={data[key]}
                            className="block cursor-grab active:cursor-grabbing"
                            style={{ height: '100%', width: 'auto' }}
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
                  Isi formulir lalu klik <b>Preview</b> — dokumen dirender dari template asli.
                  Posisi TTD/stempel hasil geser dipakai di <b>PDF</b>; file Word (.docx)
                  memakai posisi tanda tangan bawaan template.
                </p>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handlePreview}
                disabled={previewing}
                className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg border border-sky-300 text-sky-700 hover:bg-sky-50 disabled:opacity-60"
              >
                <Eye size={14} />
                {previewing ? 'Merender…' : 'Preview'}
              </button>
              {pages.length > 0 && stale && (
                <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                  Isi formulir berubah — klik Preview lagi, hasil simpan mengikuti isi terbaru.
                </span>
              )}
            </div>

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
