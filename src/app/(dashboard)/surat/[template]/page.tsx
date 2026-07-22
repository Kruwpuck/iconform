'use client';

import { useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import DocumentsTable, { type TableHandle } from '@/components/DocumentsTable';
import EditorModal, { type ExistingDoc } from '@/components/EditorModal';
import { TEMPLATES } from '@/lib/templates';
import type { TemplateType } from '@prisma/client';

export default function SuratPage() {
  const { template: templateId } = useParams<{ template: string }>();
  const def = TEMPLATES.find((t) => t.id === templateId);

  const [editDoc, setEditDoc] = useState<ExistingDoc | null>(null);
  const [creating, setCreating] = useState(false);
  const tableRef = useRef<TableHandle>(null);

  if (!def) return <p className="text-slate-500">Template tidak ditemukan.</p>;

  const modalTemplate = editDoc
    ? (TEMPLATES.find((t) => t.id === editDoc.template) ?? def)
    : creating ? def : null;

  function handleClose() { setEditDoc(null); setCreating(false); }
  function handleSaved() { setEditDoc(null); setCreating(false); tableRef.current?.refresh(); }

  return (
    <div className="space-y-4 max-w-6xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">Log — {def.label}</h1>
        <button
          onClick={() => { setEditDoc(null); setCreating(true); }}
          className="bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          + Buat Baru
        </button>
      </div>

      <DocumentsTable
        ref={tableRef}
        activeFolder={null}
        activeTemplate={templateId as TemplateType}
        onEditDoc={(doc) => { setCreating(false); setEditDoc(doc); }}
        onCountsChange={() => {}}
      />

      {modalTemplate && (
        <EditorModal
          template={modalTemplate}
          existingDoc={editDoc ?? undefined}
          onClose={handleClose}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
