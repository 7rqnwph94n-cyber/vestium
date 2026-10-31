import { useCallback, useRef } from 'react';
import type { SopDocType } from '@complianceforge/types';

export interface SopFileEntry {
  file: File;
  docType: SopDocType;
  id: string;  // local key for React
}

interface Props {
  procedureName: string;
  equipment: string;
  files: SopFileEntry[];
  onProcedureNameChange: (v: string) => void;
  onEquipmentChange: (v: string) => void;
  onFilesChange: (files: SopFileEntry[]) => void;
}

const DOC_TYPE_LABELS: Record<SopDocType, string> = {
  operator_manual: 'Operator / User Manual',
  maintenance_schedule: 'Maintenance Schedule',
  risk_assessment: 'Risk Assessment',
  coshh_datasheet: 'COSHH Data Sheet',
  other: 'Other Technical Document',
};

const ACCEPTED_TYPES = '.pdf,.txt,.text';

export const SopIntakePanel = ({
  procedureName, equipment, files,
  onProcedureNameChange, onEquipmentChange, onFilesChange,
}: Props) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback((raw: FileList | null) => {
    if (!raw) return;
    const newEntries: SopFileEntry[] = Array.from(raw).map((f) => ({
      file: f,
      docType: 'other',
      id: `${f.name}-${f.size}-${Date.now()}`,
    }));
    onFilesChange([...files, ...newEntries].slice(0, 5));
  }, [files, onFilesChange]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    handleFileSelect(e.dataTransfer.files);
  }, [handleFileSelect]);

  const updateDocType = (id: string, docType: SopDocType) => {
    onFilesChange(files.map((f) => f.id === id ? { ...f, docType } : f));
  };

  const removeFile = (id: string) => {
    onFilesChange(files.filter((f) => f.id !== id));
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="rounded-xl border border-theme-border bg-theme-panel px-6 py-5 space-y-5">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-400">
        SOP — Procedure Details
      </p>

      {/* Procedure name */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-theme-secondary">
          Procedure Name <span className="text-red-400">*</span>
        </label>
        <input
          type="text"
          value={procedureName}
          onChange={(e) => onProcedureNameChange(e.target.value)}
          placeholder="e.g. Change MIG welding gas cylinder"
          className="w-full rounded border border-theme-border bg-theme-surface px-3 py-2 text-sm text-theme-text placeholder-slate-500 focus:border-amber-500 focus:outline-none"
        />
        <p className="text-xs text-theme-muted">
          Be specific — this becomes the SOP document title.
        </p>
      </div>

      {/* Equipment */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-theme-secondary">
          Equipment <span className="text-red-400">*</span>
        </label>
        <input
          type="text"
          value={equipment}
          onChange={(e) => onEquipmentChange(e.target.value)}
          placeholder="e.g. Lincoln Electric Speedtec 505SP, model IM10053"
          className="w-full rounded border border-theme-border bg-theme-surface px-3 py-2 text-sm text-theme-text placeholder-slate-500 focus:border-amber-500 focus:outline-none"
        />
        <p className="text-xs text-theme-muted">
          Include make, model, and model number where known.
        </p>
      </div>

      {/* Source document upload */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-theme-secondary">
            Source Documents <span className="text-red-400">*</span>
          </label>
          <span className={`text-xs font-semibold ${files.length === 0 ? 'text-red-400' : 'text-emerald-400'}`}>
            {files.length}/5 uploaded
          </span>
        </div>

        {files.length === 0 && (
          <p className="text-xs text-red-400">
            At least one source document is required. Upload the operator manual, maintenance schedule, or COSHH data sheet for this procedure. The SOP pipeline extracts steps from these documents — it will not invent procedure steps from general knowledge.
          </p>
        )}

        {/* Drop zone */}
        {files.length < 5 && (
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => fileInputRef.current?.click()}
            className="cursor-pointer rounded border border-dashed border-theme-border bg-theme-panel px-4 py-6 text-center transition-colors hover:border-amber-500/60 hover:bg-theme-surface"
          >
            <p className="text-xs text-theme-secondary">
              Drag &amp; drop PDF or text files, or <span className="text-amber-400">click to browse</span>
            </p>
            <p className="mt-1 text-xs text-theme-muted">PDF or .txt — max 20 MB each, up to 5 documents</p>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_TYPES}
              multiple
              className="hidden"
              onChange={(e) => handleFileSelect(e.target.files)}
            />
          </div>
        )}

        {/* Uploaded files */}
        {files.map((entry) => (
          <div key={entry.id} className="rounded border border-theme-border bg-theme-panel px-3 py-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-theme-text">{entry.file.name}</p>
                <p className="text-xs text-theme-muted">{formatSize(entry.file.size)}</p>
              </div>
              <button
                type="button"
                onClick={() => removeFile(entry.id)}
                className="flex-shrink-0 text-xs text-theme-muted hover:text-red-400 transition-colors"
              >
                Remove
              </button>
            </div>
            <select
              value={entry.docType}
              onChange={(e) => updateDocType(entry.id, e.target.value as SopDocType)}
              className="mt-2 w-full rounded border border-theme-border bg-theme-surface px-2 py-1.5 text-xs text-theme-secondary focus:border-amber-500 focus:outline-none"
            >
              {(Object.entries(DOC_TYPE_LABELS) as [SopDocType, string][]).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </div>
  );
};
