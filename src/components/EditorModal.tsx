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
  const dirtyRef = useRef(!!existingDoc);
  const [data, setData] = useState<Record<string, string>>(() => initialData(template, existingDoc));
  const [logo, setLogo] = useState<string | null>(existingDoc?.logoBase64 ?? null);
  const [filename, setFilename] = useState(existingDoc?.filename ?? '');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function setField(name: string, value: string) {
    setData((prev) => {
      const next = { ...prev, [name]: value };
      // date fields fan out into the document's hari/tanggal/bulan/tahun tags
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
      return next;
    });
  }

  function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setLogo(ev.target?.result as string);
    reader.readAsDataURL(file);
  }

  // ttd/stempel live inside `data` → fill the {%ttd}/{%stempel} tags and
  // persist via contentHtml with zero API changes
  function handleImageField(e: React.ChangeEvent<HTMLInputElement>, key: string) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setField(key, ev.target?.result as string);
    reader.readAsDataURL(file);
  }

  function handleFilenameChange(e: React.ChangeEvent<HTMLInputElement>) {
    dirtyRef.current = true;
    setFilename(e.target.value);
  }

  async function handlePreview() {
    setPreviewing(true);
    setError('');
    try {
      const res = await fetch('/api/documents/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template: template.id, data }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(blob));
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

      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan dokumen.');
    } finally {
      setSaving(false);
    }
  }

  const folderLabel = template.folder === 'SURAT_TUGAS' ? 'Folder Surat Tugas' : 'Folder Berita Acara';

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-5xl max-h-[92vh] overflow-y-auto shadow-2xl">
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

            {([['ttd', 'Upload Tanda Tangan'], ['stempel', 'Upload Stempel']] as const).map(([key, label]) => (
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
            <div className="border-2 border-dashed border-slate-300 rounded-lg bg-slate-50 h-[480px] flex items-center justify-center overflow-hidden">
              {previewUrl ? (
                <iframe src={previewUrl} className="w-full h-full" title="Preview PDF" />
              ) : (
                <p className="text-sm text-slate-400 px-6 text-center">
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
