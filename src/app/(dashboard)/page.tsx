'use client';

import { useState, useRef } from 'react';
import FolderCards from '@/components/FolderCards';
import TemplateGrid from '@/components/TemplateGrid';
import DocumentsTable, { type TableHandle } from '@/components/DocumentsTable';
import EditorModal, { type ExistingDoc } from '@/components/EditorModal';
import { TEMPLATES, type TemplateDef } from '@/lib/templates';
import type { FolderType } from '@prisma/client';

export default function DashboardPage() {
  const [activeTemplate, setActiveTemplate] = useState<TemplateDef | null>(null);
  const [editDoc, setEditDoc] = useState<ExistingDoc | null>(null);
  const [activeFolder, setActiveFolder] = useState<FolderType | null>(null);
  const [counts, setCounts] = useState({ ST: 0, BA: 0 });
  const tableRef = useRef<TableHandle>(null);

  function handleEditDoc(doc: ExistingDoc) {
    setEditDoc(doc);
    setActiveTemplate(null);
  }

  function handleClose() {
    setActiveTemplate(null);
    setEditDoc(null);
  }

  function handleSaved() {
    setActiveTemplate(null);
    setEditDoc(null);
    tableRef.current?.refresh();
  }

  const modalTemplate = activeTemplate
    ?? (editDoc ? TEMPLATES.find((t) => t.id === editDoc.template) ?? null : null);

  return (
    <div className="space-y-6 max-w-6xl">
      <h1 className="text-2xl font-bold text-slate-800">Dashboard ICONFORM</h1>

      <FolderCards
        counts={counts}
        activeFolder={activeFolder}
        onFilter={setActiveFolder}
      />

      <TemplateGrid onSelect={(t) => { setEditDoc(null); setActiveTemplate(t); }} />

      <DocumentsTable
        ref={tableRef}
        activeFolder={activeFolder}
        onEditDoc={handleEditDoc}
        onCountsChange={setCounts}
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
