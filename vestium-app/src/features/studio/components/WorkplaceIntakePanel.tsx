// ─── Workplace Context Intake Panel ──────────────────────────────────────────
// Replaces DomainSetupPanel for Vestium compliance mode.
// Collects structured workplace context, classifies it against the regulatory
// schema matrix, and produces a DomainConfig with regulatory classification.

import { useState, useEffect } from 'react';
import { useAuth } from '@clerk/clerk-react';
import type { OrgContextDTO } from '@complianceforge/types';
import type { DomainConfig } from '../generator/types';
import type { WorkplaceContext, WorkplaceClassificationResult } from '../../regulatory/types';
import { classifyWorkplace, detectIndustryType, INDUSTRY_TYPES } from '../../regulatory/workplaceClassifier';
import { slugify, inputClass as getInputClass, labelClass, sectionHeadingClass } from './formStyles';
import { SopIntakePanel, type SopFileEntry } from '../../sop/SopIntakePanel';
import { getOrgContext, isBackendMode } from '../../../lib/api/client';

export type SopMode = 'module' | 'module+sop' | 'sop' | 'batch-sop';

export interface SopConfig {
  procedureName: string;
  equipment: string;
  files: SopFileEntry[];
}

interface Props {
  onSubmit: (config: DomainConfig) => void;
  apiKey: string;
  sopMode?: SopMode;
  onSopConfigChange?: (cfg: SopConfig) => void;
}

const HAZARD_OPTIONS = [
  { id: 'chemicals',      label: 'Hazardous substances / chemicals' },
  { id: 'lifting',        label: 'Lifting operations / lifting equipment' },
  { id: 'work-equipment', label: 'Work equipment / machinery' },
  { id: 'manual-handling',label: 'Manual handling / heavy loads' },
  { id: 'explosive-atmo', label: 'Explosive or flammable atmospheres' },
  { id: 'construction',   label: 'Construction / demolition activities' },
  { id: 'hot-work',       label: 'Hot work / welding / cutting' },
  { id: 'working-at-height', label: 'Working at height' },
  { id: 'confined-space', label: 'Confined space entry' },
  { id: 'lone-working',   label: 'Lone working' },
  { id: 'young-persons',  label: 'Young persons / new starters' },
  { id: 'new-expectant',  label: 'New or expectant mothers' },
];

const INDUSTRY_OPTIONS = [
  { value: '', label: 'Select industry…' },
  ...INDUSTRY_TYPES.map((t) => ({ value: t.id, label: t.label })),
  { value: 'other', label: 'Other (describe below)' },
];

const WORKFORCE_SIZE_OPTIONS = [
  { value: '', label: 'Select…' },
  { value: '1-4', label: 'Micro (1–4 employees)' },
  { value: '5-49', label: 'Small (5–49 employees)' },
  { value: '50-249', label: 'Medium (50–249 employees)' },
  { value: '250+', label: 'Large (250+ employees)' },
];

export function WorkplaceIntakePanel({ onSubmit, sopMode, onSopConfigChange }: Props) {
  const { getToken } = useAuth();

  // ── Org context (inherited from previous modules) ──────────────────────────
  const [orgContext, setOrgContext] = useState<OrgContextDTO | null>(null);
  const [inherited, setInherited] = useState(false);

  // ── Workplace context fields ───────────────────────────────────────────────
  const [industryType, setIndustryType] = useState('');
  const [customIndustry, setCustomIndustry] = useState('');
  const [operations, setOperations] = useState('');
  const [workforceSize, setWorkforceSize] = useState('');
  const [workforceProfile, setWorkforceProfile] = useState('');
  const [selectedHazards, setSelectedHazards] = useState<string[]>([]);
  const [additionalContext, setAdditionalContext] = useState('');

  // ── Module structure ───────────────────────────────────────────────────────
  const [moduleId, setModuleId] = useState('');
  const [idTouched, setIdTouched] = useState(false);

  // ── SOP fields (when sopMode !== 'module') ────────────────────────────────
  const [sopProcedureName, setSopProcedureName] = useState('');
  const [sopEquipment, setSopEquipment] = useState('');
  const [sopFiles, setSopFiles] = useState<SopFileEntry[]>([]);

  // ── Classification result ──────────────────────────────────────────────────
  const [classification, setClassification] = useState<WorkplaceClassificationResult | null>(null);

  // ── Fetch org context on mount ─────────────────────────────────────────────
  useEffect(() => {
    if (!isBackendMode()) return;
    let active = true;
    const load = async () => {
      try {
        const token = await getToken();
        if (!token || !active) return;
        const res = await getOrgContext(token);
        if (!active) return;
        if (res.ok && res.data) {
          setOrgContext(res.data);
          // Pre-populate form fields from inherited workplace context
          const wc = res.data.workplaceContext;
          if (wc.industryType && INDUSTRY_TYPES.some((t) => t.id === wc.industryType)) {
            setIndustryType(wc.industryType);
          } else if (wc.industryType) {
            setIndustryType('other');
            setCustomIndustry(wc.industryLabel || wc.industryType);
          }
          if (wc.operations) setOperations(wc.operations);
          if (wc.workforceProfile) {
            // Extract workforce size if embedded (e.g. "5-49 employees. Mix of...")
            const sizeMatch = wc.workforceProfile.match(/^(\d+-\d+|\d+\+)/);
            if (sizeMatch) setWorkforceSize(sizeMatch[1]);
            const profileText = wc.workforceProfile.replace(/^\d+-?\d*\+?\s*employees\.?\s*/i, '').trim();
            if (profileText) setWorkforceProfile(profileText);
          }
          if (wc.hazardKeywords?.length) setSelectedHazards(wc.hazardKeywords);
          if (wc.additionalContext) setAdditionalContext(wc.additionalContext);
          setInherited(true);
        }
      } catch {
        // Non-critical — form just starts empty
      }
    };
    void load();
    return () => { active = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Notify parent of SOP config changes ───────────────────────────────────
  useEffect(() => {
    if (!onSopConfigChange) return;
    onSopConfigChange({ procedureName: sopProcedureName, equipment: sopEquipment, files: sopFiles });
  }, [sopProcedureName, sopEquipment, sopFiles, onSopConfigChange]);

  // ── Auto-detect industry from operations text ──────────────────────────────
  useEffect(() => {
    if (industryType || operations.length < 20) return;
    const detected = detectIndustryType(operations);
    if (detected) {
      setIndustryType(detected.id);
    }
  }, [operations, industryType]);

  // ── Auto-classify on relevant field changes ────────────────────────────────
  useEffect(() => {
    const effectiveIndustry = industryType === 'other' ? 'other' : industryType;
    if (!effectiveIndustry) {
      setClassification(null);
      return;
    }

    const industryLabel =
      industryType === 'other'
        ? customIndustry.trim()
        : INDUSTRY_TYPES.find((t) => t.id === industryType)?.label ?? industryType;

    const context: WorkplaceContext = {
      industryType: effectiveIndustry,
      industryLabel,
      operations,
      workforceProfile: [
        workforceSize ? `${workforceSize} employees` : '',
        workforceProfile,
      ].filter(Boolean).join('. '),
      hazardKeywords: selectedHazards,
      additionalContext,
    };

    let cancelled = false;
    classifyWorkplace(context)
      .then((result) => {
        if (!cancelled) setClassification(result);
      })
      .catch((err) => {
        console.error('[classifier] schema load failed:', err);
        if (!cancelled) setClassification(null);
      });
    return () => { cancelled = true; };
  }, [industryType, customIndustry, operations, workforceSize, workforceProfile, selectedHazards, additionalContext]);

  // ── Derived module ID ──────────────────────────────────────────────────────
  const industryLabel =
    industryType === 'other'
      ? customIndustry.trim()
      : INDUSTRY_TYPES.find((t) => t.id === industryType)?.label ?? '';

  const derivedId = idTouched ? moduleId : slugify(industryLabel || industryType);

  const idError =
    derivedId.length === 0
      ? null
      : !/^[a-z][a-z0-9]*$/.test(derivedId)
      ? 'Must start with a letter and contain only lowercase letters/numbers'
      : null;

  // ── Submit readiness ───────────────────────────────────────────────────────
  const needsSop = sopMode === 'module+sop' || sopMode === 'sop' || sopMode === 'batch-sop';
  const sopReady = !needsSop || (
    sopProcedureName.trim().length > 0 &&
    sopEquipment.trim().length > 0 &&
    sopFiles.length > 0
  );
  const moduleFieldsRequired = sopMode !== 'sop' && sopMode !== 'batch-sop';
  const canSubmit =
    !!industryType &&
    operations.trim().length > 20 &&
    (!moduleFieldsRequired || (derivedId.length > 0 && !idError)) &&
    !!classification &&
    sopReady;

  const handleHazardToggle = (id: string) => {
    setSelectedHazards((prev) =>
      prev.includes(id) ? prev.filter((h) => h !== id) : [...prev, id]
    );
  };

  const handleSubmit = () => {
    if (!canSubmit || !classification) return;

    const industryLabelEff =
      industryType === 'other'
        ? customIndustry.trim()
        : INDUSTRY_TYPES.find((t) => t.id === industryType)?.label ?? industryType;

    // For SOP-only mode, use a placeholder moduleId (module is not created)
    const effectiveModuleId = sopMode === 'sop' ? `sop-${derivedId || 'standalone'}` : derivedId;

    // Build the domain prompt from structured inputs — this feeds into the
    // existing pipeline's prompt builders alongside the regulatory context block
    const domainPrompt = [
      `UK Health and Safety compliance training — ${industryLabelEff}`,
      `Operations: ${operations.trim()}`,
      `Applicable regulations: ${classification.applicableSchemas.map((c) => c.schema.shortTitle).join(', ')}`,
    ].join('. ');

    const audienceDescription = [
      `Workforce size: ${workforceSize || 'not specified'}`,
      workforceProfile.trim() ? `Profile: ${workforceProfile.trim()}` : '',
      `Industry: ${industryLabelEff}`,
      'Regulatory compliance training — learners include duty holders and all employees',
    ].filter(Boolean).join('. ');

    const primarySchema = classification.primarySchema.schema;

    const config: DomainConfig = {
      moduleId: effectiveModuleId,
      domainPrompt,
      audienceDescription,
      objectives: primarySchema.complianceCriteria,
      stageCount: 2,
      lessonsPerStage: 2,
      missionCount: 1,
      fastMode: false,
      sourceReferences: primarySchema.sourceDocuments.map((d) => d.url),
      workplaceContext: classification.workplaceContext,
      regulatoryClassification: classification,
    };

    onSubmit(config);
  };

  const inputClass = getInputClass('amber');
  const selectClass = inputClass;

  return (
    <div className="mx-auto max-w-2xl space-y-5 py-10 px-4">
      <div className="rounded-xl border border-theme-border bg-theme-panel px-6 py-5">
        <div className="mb-2 flex items-center gap-2">
          <span className="rounded bg-amber-900/40 border border-amber-700 px-2 py-0.5 text-xs font-semibold text-amber-400 uppercase tracking-wide">
            Compliance Mode
          </span>
        </div>
        <h2 className="text-lg font-bold text-theme-text">Workplace Context</h2>
        <p className="mt-1 text-sm text-theme-secondary">
          Describe your workplace — the platform classifies the applicable UK regulatory
          schemas and generates a compliant training module accordingly.
        </p>
      </div>

      {/* ── Inherited org context banner ─────────────────────────────────── */}
      {inherited && orgContext && (
        <div className="rounded-lg border border-emerald-700/40 bg-emerald-950/20 p-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-400">
            Inherited from your organisation
          </p>
          <p className="text-xs text-theme-secondary">
            Workplace context has been pre-populated from your existing modules.
            Fields are editable if this module requires different context.
          </p>
          {orgContext.modulesDeployed > 0 && (
            <div className="mt-2 flex items-center gap-3 text-xs text-theme-secondary">
              <span>{orgContext.modulesDeployed} module{orgContext.modulesDeployed !== 1 ? 's' : ''} deployed</span>
              {(orgContext.distilledContext.reviewerCorrections?.length ?? 0) > 0 && (
                <span className="text-amber-400">
                  {orgContext.distilledContext.reviewerCorrections.length} reviewer correction{orgContext.distilledContext.reviewerCorrections.length !== 1 ? 's' : ''} will inform this module
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Industry & operations ──────────────────────────────────────────── */}
      <section className="rounded-xl border border-theme-border bg-theme-panel px-6 py-5 space-y-5">
        <h3 className={sectionHeadingClass}>Workplace</h3>

        <div>
          <label className={labelClass}>
            Industry type <span className="text-red-400">*</span>
          </label>
          <select
            value={industryType}
            onChange={(e) => setIndustryType(e.target.value)}
            className={selectClass}
          >
            {INDUSTRY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          {industryType === 'other' && (
            <input
              type="text"
              value={customIndustry}
              onChange={(e) => setCustomIndustry(e.target.value)}
              placeholder="Describe your industry…"
              className={`mt-2 ${inputClass}`}
            />
          )}
        </div>

        <div>
          <label className={labelClass}>
            Specific operations <span className="text-red-400">*</span>
          </label>
          <textarea
            value={operations}
            onChange={(e) => setOperations(e.target.value)}
            rows={3}
            placeholder="Describe the specific work activities, processes, and tasks your workforce performs. Be specific — e.g. 'welding, grinding, and painting of steel fabrications in an enclosed workshop with 12 operatives'."
            className={inputClass}
          />
          <p className="mt-1 text-xs text-theme-muted">
            More detail produces more accurate regulatory classification.
          </p>
        </div>
      </section>

      {/* ── Workforce ─────────────────────────────────────────────────────── */}
      <section className="rounded-xl border border-theme-border bg-theme-panel px-6 py-5 space-y-5">
        <h3 className={sectionHeadingClass}>Workforce</h3>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Workforce size</label>
            <select
              value={workforceSize}
              onChange={(e) => setWorkforceSize(e.target.value)}
              className={selectClass}
            >
              {WORKFORCE_SIZE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            {workforceSize && parseInt(workforceSize) >= 5 && (
              <p className="mt-1 text-xs text-amber-600">
                5+ employees — written risk assessment records required (Reg 3(6) MHSWR)
              </p>
            )}
          </div>
          <div>
            <label className={labelClass}>
              Workforce profile{' '}
              <span className="font-normal normal-case text-theme-muted">(optional)</span>
            </label>
            <input
              type="text"
              value={workforceProfile}
              onChange={(e) => setWorkforceProfile(e.target.value)}
              placeholder="e.g. Mix of experienced operatives and apprentices"
              className={inputClass}
            />
          </div>
        </div>
      </section>

      {/* ── Hazard environment ────────────────────────────────────────────── */}
      <section className="rounded-xl border border-theme-border bg-theme-panel px-6 py-5 space-y-4">
        <h3 className={sectionHeadingClass}>Hazard Environment</h3>
        <p className="text-xs text-theme-muted">
          Select all that apply — used to refine regulatory schema classification.
        </p>
        <div className="grid grid-cols-2 gap-2">
          {HAZARD_OPTIONS.map((opt) => (
            <label key={opt.id} className="flex cursor-pointer items-start gap-2.5">
              <input
                type="checkbox"
                checked={selectedHazards.includes(opt.id)}
                onChange={() => handleHazardToggle(opt.id)}
                className="mt-0.5 h-4 w-4 flex-shrink-0 rounded border-theme-border bg-theme-surface accent-amber-500"
              />
              <span className="text-xs text-theme-secondary">{opt.label}</span>
            </label>
          ))}
        </div>

        <div>
          <label className={labelClass}>
            Additional context{' '}
            <span className="font-normal normal-case text-theme-muted">(optional)</span>
          </label>
          <textarea
            value={additionalContext}
            onChange={(e) => setAdditionalContext(e.target.value)}
            rows={2}
            placeholder="Anything else relevant — specific equipment, existing certifications, recent incidents, or regulatory history."
            className={inputClass}
          />
        </div>
      </section>

      {/* ── Regulatory classification result ──────────────────────────────── */}
      {classification && (
        <section className="rounded-xl border border-theme-border bg-theme-panel px-6 py-5 space-y-3">
          <h3 className={sectionHeadingClass}>Regulatory Classification</h3>
          <div className="rounded-lg border border-theme-border bg-theme-surface p-4 space-y-3">
            <p className="text-xs text-theme-secondary">{classification.classificationNotes}</p>
            <div className="space-y-2">
              {classification.applicableSchemas.map((classified) => {
                const isBuilt = !!classified.schema.siNumber;
                return (
                  <div
                    key={classified.schema.id}
                    className={`flex items-center justify-between rounded-lg px-3 py-2 text-xs ${
                      classified.schema.id === 'mhswr-1999'
                        ? 'bg-amber-900/20 border border-amber-800'
                        : isBuilt
                        ? 'bg-theme-raised/40 border border-theme-border'
                        : 'bg-theme-surface/40 border border-theme-border opacity-60'
                    }`}
                  >
                    <div>
                      <span className="font-semibold text-theme-text">
                        {classified.schema.shortTitle}
                      </span>
                      {!isBuilt && (
                        <span className="ml-2 rounded bg-theme-raised px-1.5 py-0.5 text-theme-muted text-xs">
                          pending
                        </span>
                      )}
                      {classified.mandatoryForContext && isBuilt && (
                        <span className="ml-2 rounded bg-amber-900/50 border border-amber-700 px-1.5 py-0.5 text-amber-400 text-xs">
                          mandatory
                        </span>
                      )}
                    </div>
                    <span className="text-theme-muted">
                      weight {(classified.weight * 100).toFixed(0)}%
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-theme-muted">
              Phase 1: module will be generated against MHSWR 1999.
              Additional schemas integrated in Phase 5.
            </p>
          </div>
        </section>
      )}

      {/* ── SOP intake (when sopMode includes SOP) ────────────────────────── */}
      {sopMode && sopMode !== 'module' && (
        <SopIntakePanel
          procedureName={sopProcedureName}
          equipment={sopEquipment}
          files={sopFiles}
          onProcedureNameChange={setSopProcedureName}
          onEquipmentChange={setSopEquipment}
          onFilesChange={setSopFiles}
        />
      )}

      {/* ── Module structure (fixed 2/2/1, hidden for SOP-only mode) ────── */}
      {sopMode !== 'sop' && (
      <section className="rounded-xl border border-theme-border bg-theme-panel px-6 py-5 space-y-5">
        <h3 className={sectionHeadingClass}>Module Structure</h3>

        <div>
          <label className={labelClass}>
            Module ID{' '}
            <span className="font-normal normal-case text-theme-muted">(auto-generated — editable)</span>
          </label>
          <input
            type="text"
            value={idTouched ? moduleId : derivedId}
            onChange={(e) => { setIdTouched(true); setModuleId(e.target.value.toLowerCase()); }}
            placeholder="mhswr-induction"
            className={`${inputClass} font-mono`}
          />
          {idError && <p className="mt-1 text-xs text-red-400">{idError}</p>}
        </div>

        <div className="rounded border border-amber-700/40 bg-amber-950/20 p-3 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-300">Foundation Module</p>
          <div className="text-xs text-theme-secondary">
            2 stages · 2 lessons per stage · 1 regulatory scenario mission · 2 stage tests
          </div>
          <p className="text-xs text-theme-muted">
            Each module in your programme builds on previous modules. Reviewer corrections
            and domain insights carry forward automatically.
          </p>
        </div>
      </section>
      )}

      <button
        onClick={handleSubmit}
        disabled={!canSubmit}
        className="w-full rounded bg-amber-700 px-4 py-3 text-sm font-semibold text-white hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
      >
        {sopMode === 'sop'
          ? 'Classify Workplace and Generate SOP →'
          : sopMode === 'module+sop'
          ? 'Classify Workplace and Continue →'
          : 'Classify Workplace and Continue →'}
      </button>

      {!canSubmit && (
        <p className="text-center text-xs text-theme-muted">
          {!industryType
            ? 'Select an industry type to continue'
            : operations.trim().length <= 20
            ? 'Describe the specific operations (at least 20 characters)'
            : needsSop && sopFiles.length === 0
            ? 'Upload at least one source document to generate the SOP'
            : needsSop && (!sopProcedureName.trim() || !sopEquipment.trim())
            ? 'Enter procedure name and equipment for the SOP'
            : 'Complete required fields above'}
        </p>
      )}
    </div>
  );
}
