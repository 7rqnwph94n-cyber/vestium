// ─── RAMS Intake Panel ────────────────────────────────────────────────────────
// Creation form for new RAMS records. Handles task description, location,
// equipment, and source document upload.

import { useState, useCallback } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { Card } from '../../components/Card';
import {
  createRams,
  uploadRamsSourceDoc,
} from '../../lib/api/client';
import type { RamsRecord, RamsDocType, WorkplaceContextDTO, ClassificationSummaryDTO } from '@complianceforge/types';

interface RamsIntakePanelProps {
  workplaceContext: WorkplaceContextDTO;
  regulatoryClassification: ClassificationSummaryDTO | Record<string, unknown>;
  onCreated: (rams: RamsRecord & { registryId: string }) => void;
}

interface UploadedDoc {
  localKey: string;
  file: File;
  docType: RamsDocType;
}

const DOC_TYPE_OPTIONS: { value: RamsDocType; label: string }[] = [
  { value: 'risk_assessment', label: 'Risk Assessment' },
  { value: 'method_statement', label: 'Method Statement' },
  { value: 'coshh_datasheet', label: 'COSHH Datasheet' },
  { value: 'permit_to_work', label: 'Permit to Work' },
  { value: 'equipment_manual', label: 'Equipment Manual' },
  { value: 'other', label: 'Other' },
];

export const RamsIntakePanel = ({ workplaceContext, regulatoryClassification, onCreated }: RamsIntakePanelProps) => {
  const { getToken } = useAuth();
  const [title, setTitle] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [location, setLocation] = useState('');
  const [equipmentCsv, setEquipmentCsv] = useState('');
  const [docs, setDocs] = useState<UploadedDoc[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const addFile = useCallback((files: FileList | null) => {
    if (!files) return;
    const newDocs: UploadedDoc[] = [];
    for (const file of Array.from(files)) {
      if (docs.length + newDocs.length >= 5) break;
      newDocs.push({ localKey: `${Date.now()}-${file.name}`, file, docType: 'other' });
    }
    setDocs((prev) => [...prev, ...newDocs]);
  }, [docs.length]);

  const removeDoc = (key: string) => setDocs((prev) => prev.filter((d) => d.localKey !== key));

  const setDocType = (key: string, docType: RamsDocType) =>
    setDocs((prev) => prev.map((d) => (d.localKey === key ? { ...d, docType } : d)));

  const canCreate =
    title.trim().length > 0 &&
    taskDescription.trim().length > 0 &&
    docs.length > 0;

  const handleCreate = async () => {
    if (!canCreate) return;
    setError(null);
    setCreating(true);

    try {
      const token = await getToken();
      if (!token) throw new Error('No session token');

      const equipment = equipmentCsv.split(',').map((s) => s.trim()).filter(Boolean);

      const res = await createRams(token, {
        title: title.trim(),
        taskDescription: taskDescription.trim(),
        location: location.trim(),
        equipment,
        workplaceContext,
        regulatoryClassification,
      });

      if (!res.ok) throw new Error(res.error);

      // Upload source documents
      for (const doc of docs) {
        const uploadRes = await uploadRamsSourceDoc(token, res.data.id, doc.file, doc.docType);
        if (!uploadRes.ok) {
          console.warn('Source doc upload failed:', uploadRes.error);
        }
      }

      onCreated(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create RAMS');
    } finally {
      setCreating(false);
    }
  };

  return (
    <Card title="New RAMS/SSOW">
      <div className="space-y-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-theme-secondary">Title <span className="text-red-400">*</span></label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Working at Height — Roof Access"
            className="w-full rounded border border-theme-border bg-theme-surface px-3 py-2 text-sm text-theme-text focus:border-amber-500 focus:outline-none"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-theme-secondary">Task Description <span className="text-red-400">*</span></label>
          <textarea
            value={taskDescription}
            onChange={(e) => setTaskDescription(e.target.value)}
            placeholder="Describe the work activity, including what is being done, how, and any specific conditions"
            rows={3}
            className="w-full rounded border border-theme-border bg-theme-surface px-3 py-2 text-sm text-theme-text focus:border-amber-500 focus:outline-none"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="text-xs font-medium text-theme-secondary">Location</label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Unit 4 Roof, Site B"
              className="w-full rounded border border-theme-border bg-theme-surface px-3 py-2 text-sm text-theme-text focus:border-amber-500 focus:outline-none"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-theme-secondary">Equipment</label>
            <input
              type="text"
              value={equipmentCsv}
              onChange={(e) => setEquipmentCsv(e.target.value)}
              placeholder="Comma-separated, e.g. Scaffold, Harness"
              className="w-full rounded border border-theme-border bg-theme-surface px-3 py-2 text-sm text-theme-text focus:border-amber-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Source documents */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-theme-secondary">
            Source Documents <span className="text-red-400">*</span>
            <span className="text-theme-muted ml-1">({docs.length}/5)</span>
          </label>

          {docs.length < 5 && (
            <label className="flex cursor-pointer items-center justify-center rounded border-2 border-dashed border-theme-border bg-theme-surface px-4 py-3 text-xs text-theme-secondary hover:border-amber-500/50 hover:text-theme-secondary transition-colors">
              <input
                type="file"
                accept=".pdf,.txt,.md"
                multiple
                className="hidden"
                onChange={(e) => addFile(e.target.files)}
              />
              Drop or click to upload (PDF, TXT)
            </label>
          )}

          {docs.map((doc) => (
            <div key={doc.localKey} className="flex items-center gap-2 rounded border border-theme-border bg-theme-surface px-3 py-2">
              <span className="text-xs text-theme-secondary truncate flex-1">{doc.file.name}</span>
              <select
                value={doc.docType}
                onChange={(e) => setDocType(doc.localKey, e.target.value as RamsDocType)}
                className="rounded border border-theme-border bg-theme-panel px-2 py-1 text-xs text-theme-text"
              >
                {DOC_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <button
                onClick={() => removeDoc(doc.localKey)}
                className="text-xs text-red-400 hover:text-red-300"
              >
                Remove
              </button>
            </div>
          ))}
        </div>

        {error && <p className="text-red-400 text-xs">{error}</p>}

        <button
          onClick={() => void handleCreate()}
          disabled={!canCreate || creating}
          className="w-full rounded bg-amber-600 py-2 text-sm font-semibold text-white hover:bg-amber-500 transition-colors disabled:opacity-50"
        >
          {creating ? 'Creating...' : 'Create RAMS'}
        </button>
      </div>
    </Card>
  );
};
