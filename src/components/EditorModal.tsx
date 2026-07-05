'use client';

import { useRef, useState, useEffect } from 'react';
import { X, ImagePlus, Save } from 'lucide-react';
import type { TemplateDef } from '@/lib/templates';
import type { FolderType, TemplateType } from '@prisma/client';

export type ExistingDoc = {
  id: string;
  filename: string;
  contentHtml: string;
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

function exportShell(html: string) {
  return `<div style="font-family:'Times New Roman',serif;font-size:12pt;color:#000;padding:30px">${html}</div>`;
}

async function generateBlobs(contentHtml: string): Promise<{ pdfBlob: Blob; docxBlob: Blob }> {
  const shell = exportShell(contentHtml);
  const [{ default: html2pdf }, { asBlob }] = await Promise.all([
    // ponytail: dynamic import required — html2pdf.js touches window at module eval
    import('html2pdf.js'),
    import('html-docx-js-typescript'),
  ]);
  const pdfBlob: Blob = await html2pdf()
    .set({ margin: 10, jsPDF: { format: 'a4' } })
    .from(shell)
    .outputPdf('blob');
  const docxBlob = (await asBlob(shell)) as Blob;
  return { pdfBlob, docxBlob };
}

export default function EditorModal({ template, existingDoc, onClose, onSaved }: Props) {
  const editorRef = useRef<HTMLDivElement>(null);
  const dirtyRef = useRef(!!existingDoc);
  const [filename, setFilename] = useState(existingDoc?.filename ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Seed contenteditable once on mount
  useEffect(() => {
    if (editorRef.current) {
      // ponytail: innerHTML required for contenteditable HTML templates. Content is
      // hardcoded template strings or DB-persisted admin edits from authenticated users only.
      // Ceiling: add DOMPurify if this tool ever becomes multi-tenant or publicly accessible.
      editorRef.current.innerHTML = existingDoc?.contentHtml ?? template.html;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleEditorInput() {
    if (!dirtyRef.current && editorRef.current) {
      const suggested = template.suggestName(editorRef.current);
      if (suggested) setFilename(suggested);
    }
  }

  function handleFilenameChange(e: React.ChangeEvent<HTMLInputElement>) {
    dirtyRef.current = true;
    setFilename(e.target.value);
  }

  function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !editorRef.current) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const src = ev.target?.result as string;
      const editor = editorRef.current!;
      let slot = editor.querySelector<HTMLElement>('[data-logo-slot]');
      if (!slot) {
        slot = document.createElement('div');
        slot.setAttribute('data-logo-slot', '');
        slot.style.marginBottom = '8px';
        editor.insertBefore(slot, editor.firstChild);
      }
      slot.innerHTML = `<img src="${src}" style="max-height:64px;" alt="Logo Mitra" />`;
    };
    reader.readAsDataURL(file);
  }

  async function handleSave() {
    const name = filename.trim();
    if (!name) { setError('Nama file tidak boleh kosong.'); return; }
    if (!editorRef.current) return;

    setSaving(true);
    setError('');
    try {
      const contentHtml = editorRef.current.innerHTML;
      const logoSlot = editorRef.current.querySelector<HTMLImageElement>('[data-logo-slot] img');
      const logoBase64 = logoSlot?.src?.startsWith('data:') ? logoSlot.src : null;

      const { pdfBlob, docxBlob } = await generateBlobs(contentHtml);

      const form = new FormData();
      form.append('filename', name);
      form.append('folder', template.folder);
      form.append('template', template.id);
      form.append('contentHtml', contentHtml);
      if (logoBase64) form.append('logoBase64', logoBase64);
      form.append('pdf', new File([pdfBlob], name + '.pdf', { type: 'application/pdf' }));
      form.append('docx', new File([docxBlob], name + '.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));

      const url = existingDoc ? `/api/documents/${existingDoc.id}` : '/api/documents';
      const method = existingDoc ? 'PUT' : 'POST';
      const res = await fetch(url, { method, body: form });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `HTTP ${res.status}`);
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
      <div className="bg-white rounded-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-2xl">
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

        <div className="p-6 space-y-4">
          {/* Logo upload (Berita Acara only) */}
          {template.allowLogo && (
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-slate-600 cursor-pointer w-fit">
                <ImagePlus size={16} />
                Upload Logo Mitra
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleLogoUpload}
                />
              </label>
              <p className="text-xs text-slate-400 mt-0.5">Logo akan muncul di sudut kiri atas dokumen</p>
            </div>
          )}

          {/* Editor frame */}
          <div className="border-2 border-dashed border-slate-300 rounded-lg p-2 bg-white">
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              onInput={handleEditorInput}
              className="min-h-[350px] p-8 prose max-w-none outline-none"
              style={{ fontFamily: "'Times New Roman', serif" }}
            />
          </div>

          <p className="text-xs text-slate-400">
            Klik teks berwarna kuning untuk mengedit isian dokumen.
          </p>

          {/* Blue info panel */}
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

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
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
  );
}
