import { useState } from 'react';
import type { StepResult } from '../generator/types';
import { StreamingOutput } from './StreamingOutput';

interface Props {
  stepKey: string;
  result: StepResult;
  isActive: boolean;
  streamedText: string;
  onRegenerate: (stepKey: string) => void;
  onManualEdit: (stepKey: string, json: unknown) => void;
}

function stepTitle(key: string): string {
  if (key === 'blueprint') return 'Curriculum Blueprint';
  if (key === 'missions') return 'Training Missions';
  if (key === 'placementAssessment') return 'Placement Assessment';
  if (key === 'lessonMissionMap') return 'Lesson-to-Mission Gating Map';
  if (key === 'sourceAttribution') return 'Source Attribution';
  if (key === 'factCheck') return 'Fact Check';
  if (key === 'advancedArtifacts') return 'Advanced Artifacts';
  if (key === 'themeShell') return 'Theme Configuration';
  const s = key.match(/^stage_(\d+)$/);
  if (s) return `Stage ${s[1]} — Lessons`;
  const t = key.match(/^test_(\d+)$/);
  if (t) return `Stage ${t[1]} — Test Questions`;
  return key;
}

export function StepCard({ stepKey, result, isActive, streamedText, onRegenerate, onManualEdit }: Props) {
  const [editMode, setEditMode] = useState(false);
  const [editText, setEditText] = useState('');
  const [editError, setEditError] = useState<string | null>(null);

  const displayText = isActive ? streamedText : result.rawOutput;

  const handleEditStart = () => {
    setEditText(JSON.stringify(result.parsedJson, null, 2));
    setEditError(null);
    setEditMode(true);
  };

  const handleEditSave = () => {
    try {
      const parsed = JSON.parse(editText);
      onManualEdit(stepKey, parsed);
      setEditMode(false);
      setEditError(null);
    } catch {
      setEditError('Invalid JSON — check syntax and try again');
    }
  };

  return (
    <div
      id={stepKey}
      className={`rounded border ${
        isActive
          ? 'border-violet-600/50 bg-theme-panel'
          : result.status === 'error'
          ? 'border-red-800/50 bg-theme-panel'
          : result.status === 'done'
          ? 'border-theme-border bg-theme-panel/60'
          : 'border-theme-border-subtle bg-theme-panel/30 opacity-50'
      }`}
    >
      <div className="flex items-center justify-between border-b border-theme-border-subtle px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-theme-text">{stepTitle(stepKey)}</span>
          {isActive && (
            <span className="rounded bg-violet-900/40 px-1.5 py-0.5 text-xs text-violet-300">
              Generating…
            </span>
          )}
          {result.status === 'done' && !isActive && (
            <span className="rounded bg-emerald-900/30 px-1.5 py-0.5 text-xs text-emerald-400">
              Done
            </span>
          )}
          {result.status === 'error' && (
            <span className="rounded bg-red-900/30 px-1.5 py-0.5 text-xs text-red-400">
              Error
            </span>
          )}
        </div>
        {(result.status === 'done' || result.status === 'error') && !isActive && (
          <div className="flex items-center gap-2">
            {result.status === 'done' && (
              <button
                onClick={handleEditStart}
                className="text-xs text-theme-muted hover:text-theme-secondary transition-colors"
              >
                Edit JSON
              </button>
            )}
            <button
              onClick={() => onRegenerate(stepKey)}
              className="text-xs text-violet-500 hover:text-violet-300 transition-colors"
            >
              ↺ Regenerate
            </button>
          </div>
        )}
      </div>

      <div className="p-3">
        {editMode ? (
          <div className="space-y-2">
            <textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              rows={20}
              className="w-full rounded border border-theme-border bg-theme-base p-3 font-mono text-xs text-theme-secondary focus:border-violet-500 focus:outline-none resize-y"
            />
            {editError && (
              <p className="text-xs text-red-400">{editError}</p>
            )}
            <div className="flex gap-2">
              <button
                onClick={handleEditSave}
                className="rounded bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-500"
              >
                Save
              </button>
              <button
                onClick={() => setEditMode(false)}
                className="rounded border border-theme-border px-3 py-1.5 text-xs text-theme-secondary hover:text-theme-text"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <StreamingOutput
            text={displayText}
            minHeight={isActive ? '180px' : '80px'}
          />
        )}

        {result.status === 'error' && (
          <div className="mt-2 space-y-1 rounded border border-red-800 bg-red-900/20 px-3 py-2 text-xs text-red-400">
            <p className="font-semibold">Generation failed</p>
            {result.rawOutput && (
              <p className="font-mono break-all opacity-80">{result.rawOutput}</p>
            )}
            <p className="opacity-60">Edit the JSON manually above or regenerate this step.</p>
          </div>
        )}
      </div>
    </div>
  );
}
