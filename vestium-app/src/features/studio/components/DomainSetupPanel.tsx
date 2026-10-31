import { useState } from 'react';
import type { DomainConfig, PreflightResult } from '../generator/types';
import { runPreflight } from '../generator/stepRunners';
import { ProviderKeysPanel } from './ProviderKeysPanel';
import { slugify, inputClass as getInputClass, labelClass, sectionHeadingClass } from './formStyles';

interface Props {
  onSubmit: (config: DomainConfig) => void;
  apiKey: string;
}

const RESERVED_IDS = ['controller', 'sales', 'customerservice'];

const SECTOR_OPTIONS = [
  { value: '', label: 'Select sector…' },
  { value: 'manufacturing', label: 'Manufacturing & industrial' },
  { value: 'mining', label: 'Mining & resources' },
  { value: 'healthcare', label: 'Healthcare & medical' },
  { value: 'hospitality', label: 'Food & hospitality' },
  { value: 'retail', label: 'Retail & customer service' },
  { value: 'construction', label: 'Construction & trades' },
  { value: 'technology', label: 'Technology & software' },
  { value: 'transport', label: 'Transport & logistics' },
  { value: 'education', label: 'Education & academic' },
  { value: 'finance', label: 'Finance & professional services' },
  { value: 'other', label: 'Other (describe below)' },
];

const DELIVERY_OPTIONS = [
  { value: '', label: 'Select format…' },
  { value: 'self-paced online', label: 'Self-paced online' },
  { value: 'instructor-led classroom', label: 'Instructor-led classroom' },
  { value: 'on-the-job training', label: 'On-the-job training' },
  { value: 'blended (classroom + online)', label: 'Blended (classroom + online)' },
];

const AGE_OPTIONS = [
  { value: '', label: 'Select…' },
  { value: '14–17', label: 'Teens (14–17)' },
  { value: '18–25', label: 'Young adults (18–25)' },
  { value: '25–40', label: 'Adults (25–40)' },
  { value: '40+', label: 'Mature (40+)' },
  { value: 'mixed ages', label: 'Mixed ages' },
];

const ABILITY_OPTIONS = [
  { value: 'beginner', label: 'Beginner', desc: 'No prior knowledge' },
  { value: 'some', label: 'Some experience', desc: 'Basic awareness' },
  { value: 'experienced', label: 'Experienced', desc: 'Upskilling' },
  { value: 'expert', label: 'Expert / recert', desc: 'Specialist depth' },
];

const ABILITY_LABELS: Record<string, string> = {
  beginner: 'Complete beginners with no prior background',
  some: 'Learners with some prior exposure but limited practical experience',
  experienced: 'Experienced practitioners looking to upskill or formalise knowledge',
  expert: 'Subject-matter experts seeking recertification or specialist depth',
};

export function DomainSetupPanel({ onSubmit, apiKey }: Props) {
  // ── Subject & context ──────────────────────────────────────────────────────
  const [subject, setSubject] = useState('');
  const [sector, setSector] = useState('');
  const [customSector, setCustomSector] = useState('');
  const [deliveryFormat, setDeliveryFormat] = useState('');

  // ── Learner profile ────────────────────────────────────────────────────────
  const [abilityLevel, setAbilityLevel] = useState('');
  const [ageRange, setAgeRange] = useState('');
  const [priorKnowledge, setPriorKnowledge] = useState('');
  const [primaryTask, setPrimaryTask] = useState('');
  const [hasSafetyContent, setHasSafetyContent] = useState(false);

  // ── Shared fields ──────────────────────────────────────────────────────────
  const [objectivesInput, setObjectivesInput] = useState('');
  const [moduleId, setModuleId] = useState('');
  const [stageCount, setStageCount] = useState(5);
  const [lessonsPerStage, setLessonsPerStage] = useState(4);
  const [missionCount, setMissionCount] = useState(5);
  const [sourceReferencesInput, setSourceReferencesInput] = useState('');
  const [idTouched, setIdTouched] = useState(false);

  // ── Preflight ──────────────────────────────────────────────────────────────
  const [preflightRunning, setPreflightRunning] = useState(false);
  const [preflightResult, setPreflightResult] = useState<PreflightResult | null>(null);
  const [preflightError, setPreflightError] = useState<string | null>(null);

  // ── Compose AI prompt strings from structured inputs ───────────────────────
  const sectorLabel =
    sector === 'other'
      ? customSector.trim()
      : SECTOR_OPTIONS.find((o) => o.value === sector)?.label ?? '';

  const effectiveDomain = [
    subject.trim(),
    sectorLabel ? `in the ${sectorLabel.toLowerCase()} sector` : '',
    deliveryFormat ? `(${deliveryFormat})` : '',
  ]
    .filter(Boolean)
    .join(' ');

  const effectiveAudience = [
    abilityLevel ? ABILITY_LABELS[abilityLevel] : '',
    ageRange ? `Age group: ${ageRange}` : '',
    priorKnowledge.trim() ? `Prior knowledge: ${priorKnowledge.trim()}` : '',
    primaryTask.trim() ? `Goal: learners should be able to ${primaryTask.trim()}` : '',
    hasSafetyContent
      ? 'Covers safety-critical or regulated content — high citation fidelity required'
      : '',
  ]
    .filter(Boolean)
    .join('. ');

  // ── Derived values ─────────────────────────────────────────────────────────
  const sourceReferences = sourceReferencesInput
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  const objectives = objectivesInput
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

  const derivedId = idTouched ? moduleId : slugify(subject);
  const idError =
    derivedId.length === 0
      ? null
      : !/^[a-z][a-z0-9]*$/.test(derivedId)
      ? 'Must start with a letter and contain only lowercase letters/numbers'
      : RESERVED_IDS.includes(derivedId)
      ? `"${derivedId}" is already used — choose a different module ID`
      : null;

  const canRunPreflight =
    subject.trim().length > 3 &&
    abilityLevel !== '' &&
    !preflightRunning;

  const canSubmit =
    subject.trim().length > 3 &&
    abilityLevel !== '' &&
    derivedId.length > 0 &&
    !idError &&
    !preflightRunning &&
    preflightResult?.clearEnough !== false;

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handlePreflight = async () => {
    if (!canRunPreflight) return;
    setPreflightRunning(true);
    setPreflightResult(null);
    setPreflightError(null);
    try {
      const result = await runPreflight(effectiveDomain, effectiveAudience, objectives, apiKey);
      setPreflightResult(result);
    } catch (err) {
      setPreflightError(err instanceof Error ? err.message : 'Preflight check failed');
    } finally {
      setPreflightRunning(false);
    }
  };

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit({
      moduleId: derivedId,
      domainPrompt: effectiveDomain,
      audienceDescription: effectiveAudience,
      objectives,
      stageCount,
      lessonsPerStage,
      missionCount,
      sourceReferences,
    });
  };

  const inputClass = getInputClass('violet');
  const selectClass = inputClass;

  return (
    <div className="mx-auto max-w-2xl space-y-8 py-10 px-4">
      <div>
        <h2 className="text-lg font-bold text-theme-text">New Module Setup</h2>
        <p className="mt-1 text-sm text-theme-secondary">
          Answer a few questions — the generator will build a complete curriculum from your inputs.
        </p>
      </div>

      {/* ── What are you teaching? ─────────────────────────────────────────── */}
      <section className="space-y-5">
        <h3 className={sectionHeadingClass}>What are you teaching?</h3>

        <div>
          <label className={labelClass}>
            Subject / Topic <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="e.g. Hydraulic fault-finding, Python for data analysis, Barista skills"
            className={inputClass}
          />
          <p className="mt-1 text-xs text-theme-muted">
            Be specific — include the domain and technical focus.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Industry / Sector</label>
            <select
              value={sector}
              onChange={(e) => setSector(e.target.value)}
              className={selectClass}
            >
              {SECTOR_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            {sector === 'other' && (
              <input
                type="text"
                value={customSector}
                onChange={(e) => setCustomSector(e.target.value)}
                placeholder="Describe your sector…"
                className={`mt-2 ${inputClass}`}
              />
            )}
          </div>
          <div>
            <label className={labelClass}>Delivery Format</label>
            <select
              value={deliveryFormat}
              onChange={(e) => setDeliveryFormat(e.target.value)}
              className={selectClass}
            >
              {DELIVERY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <div className="border-t border-theme-border-subtle" />

      {/* ── Who is learning? ─────────────────────────────────────────────── */}
      <section className="space-y-5">
        <h3 className={sectionHeadingClass}>Who is learning?</h3>

        {/* Ability level — styled button grid */}
        <div>
          <label className={labelClass}>
            Ability Level <span className="text-red-400">*</span>
          </label>
          <div className="grid grid-cols-4 gap-2">
            {ABILITY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setAbilityLevel(opt.value)}
                className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${
                  abilityLevel === opt.value
                    ? 'border-violet-500 bg-violet-900/30 text-violet-300'
                    : 'border-theme-border bg-theme-surface/50 text-theme-secondary hover:border-theme-border hover:text-theme-secondary'
                }`}
              >
                <div className="text-xs font-semibold leading-tight">{opt.label}</div>
                <div className="mt-0.5 text-xs leading-tight text-theme-muted">{opt.desc}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Target Age Group</label>
            <select
              value={ageRange}
              onChange={(e) => setAgeRange(e.target.value)}
              className={selectClass}
            >
              {AGE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end pb-px">
            <label className="flex cursor-pointer items-start gap-2.5">
              <input
                type="checkbox"
                checked={hasSafetyContent}
                onChange={(e) => setHasSafetyContent(e.target.checked)}
                className="mt-0.5 h-4 w-4 flex-shrink-0 rounded border-theme-border bg-theme-surface accent-violet-500"
              />
              <div>
                <div className="text-xs font-semibold text-theme-secondary">
                  Safety / compliance content
                </div>
                <div className="mt-0.5 text-xs text-theme-muted">
                  Enforces strict citation requirements
                </div>
              </div>
            </label>
          </div>
        </div>

        <div>
          <label className={labelClass}>
            What learners already know{' '}
            <span className="font-normal normal-case text-theme-muted">(optional)</span>
          </label>
          <input
            type="text"
            value={priorKnowledge}
            onChange={(e) => setPriorKnowledge(e.target.value)}
            placeholder="e.g. Basic mechanical theory, completed safety induction, familiar with hand tools"
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass}>
            Primary learning goal{' '}
            <span className="font-normal normal-case text-theme-muted">(recommended)</span>
          </label>
          <input
            type="text"
            value={primaryTask}
            onChange={(e) => setPrimaryTask(e.target.value)}
            placeholder="e.g. Diagnose and repair hydraulic faults on mobile plant equipment without supervision"
            className={inputClass}
          />
          <p className="mt-1 text-xs text-theme-muted">
            Start with a verb: "Diagnose…", "Configure…", "Handle…", "Produce…"
          </p>
        </div>
      </section>

      <div className="border-t border-theme-border-subtle" />

      {/* ── Learning objectives ───────────────────────────────────────────── */}
      <section className="space-y-5">
        <h3 className={sectionHeadingClass}>Learning Objectives</h3>
        <div>
          <label className={labelClass}>
            Specific objectives{' '}
            <span className="font-normal normal-case text-theme-muted">(optional, one per line)</span>
          </label>
          <textarea
            value={objectivesInput}
            onChange={(e) => setObjectivesInput(e.target.value)}
            rows={4}
            placeholder={
              'Recognise social engineering red flags before interacting with links.\nApply incident reporting steps within 5 minutes of suspected compromise.'
            }
            className={inputClass}
          />
          <p className="mt-1 text-xs text-theme-muted">
            Used for coverage validation — alignment checked across lessons, missions, and
            assessments. Leave blank and the generator infers objectives from your subject.
          </p>
        </div>
      </section>

      <div className="border-t border-theme-border-subtle" />

      {/* ── Module structure ─────────────────────────────────────────────── */}
      <section className="space-y-5">
        <h3 className={sectionHeadingClass}>Module Structure</h3>

        <div>
          <label className={labelClass}>
            Module ID{' '}
            <span className="font-normal normal-case text-theme-muted">(auto-generated — editable)</span>
          </label>
          <input
            type="text"
            value={idTouched ? moduleId : derivedId}
            onChange={(e) => {
              setIdTouched(true);
              setModuleId(e.target.value.toLowerCase());
            }}
            placeholder="hydraulics"
            className={`${inputClass} font-mono`}
          />
          {idError && <p className="mt-1 text-xs text-red-400">{idError}</p>}
          {!idError && derivedId && (
            <p className="mt-1 text-xs text-theme-muted">
              Accessible at /{derivedId}/dashboard
            </p>
          )}
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className={labelClass}>Stages</label>
            <select
              value={stageCount}
              onChange={(e) => setStageCount(Number(e.target.value))}
              className={selectClass}
            >
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Lessons / Stage</label>
            <select
              value={lessonsPerStage}
              onChange={(e) => setLessonsPerStage(Number(e.target.value))}
              className={selectClass}
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Missions</label>
            <select
              value={missionCount}
              onChange={(e) => setMissionCount(Number(e.target.value))}
              className={selectClass}
            >
              {[1, 2, 3, 4, 5, 6, 8].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="rounded border border-theme-border bg-theme-surface/50 p-3 text-xs text-theme-muted">
          {stageCount} stages × {lessonsPerStage} lessons = {stageCount * lessonsPerStage} lessons
          {' · '}
          {stageCount} stage tests (8 questions each)
          {' · '}
          {missionCount} scenario missions
          {' · '}
          {objectives.length > 0
            ? `${objectives.length} objective(s)`
            : 'objectives auto-inferred'}
          {' · '}
          {sourceReferences.length} source reference(s)
          {' · '}
          Total API calls: {1 + stageCount * 2 + 6 + stageCount + stageCount + 1}
          {' · '}+ conditional repair calls
        </div>
      </section>

      <div className="border-t border-theme-border-subtle" />

      {/* ── Source references ─────────────────────────────────────────────── */}
      <section className="space-y-5">
        <h3 className={sectionHeadingClass}>Source References</h3>
        <div>
          <label className={labelClass}>
            Seed URLs{' '}
            <span className="font-normal normal-case text-theme-muted">
              (optional — AI auto-discovers additional sources)
            </span>
          </label>
          <textarea
            value={sourceReferencesInput}
            onChange={(e) => setSourceReferencesInput(e.target.value)}
            rows={3}
            placeholder={'https://example.com/standard-or-doc\nhttps://vendor.com/manual'}
            className={`${inputClass} font-mono text-xs`}
          />
          <p className="mt-1 text-xs text-theme-muted">
            Studio validates citation depth for critical claims — seed URLs improve source quality.
          </p>
        </div>
      </section>

      <ProviderKeysPanel />

      {/* ── Preflight check ───────────────────────────────────────────────── */}
      <div className="space-y-3">
        <button
          onClick={handlePreflight}
          disabled={!canRunPreflight}
          className="w-full rounded border border-theme-border bg-theme-surface px-4 py-2.5 text-sm font-medium text-theme-secondary hover:bg-theme-raised disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
        >
          {preflightRunning ? 'Checking domain…' : 'Check Domain Clarity'}
        </button>

        {preflightError && (
          <p className="rounded bg-red-950/40 border border-red-800 px-3 py-2 text-xs text-red-400">
            Preflight error: {preflightError}
          </p>
        )}

        {preflightResult && (
          <div
            className={`rounded border px-3 py-2.5 text-xs space-y-1.5 ${
              preflightResult.clearEnough
                ? 'border-emerald-700 bg-emerald-950/30'
                : 'border-amber-700 bg-amber-950/30'
            }`}
          >
            <p
              className={`font-semibold ${
                preflightResult.clearEnough ? 'text-emerald-400' : 'text-amber-400'
              }`}
            >
              {preflightResult.clearEnough
                ? '✓ Looks good — ready to generate'
                : '⚠ Domain needs improvement'}
            </p>
            {preflightResult.issues.map((issue, i) => (
              <p key={i} className="text-theme-secondary">
                • {issue}
              </p>
            ))}
            {preflightResult.suggestedImprovement && (
              <p className="italic text-theme-muted">{preflightResult.suggestedImprovement}</p>
            )}
            {!preflightResult.clearEnough && import.meta.env.DEV && (
              <button
                onClick={() => setPreflightResult({ ...preflightResult, clearEnough: true })}
                className="mt-1 text-xs text-theme-muted underline hover:text-theme-secondary"
              >
                Generate anyway (override)
              </button>
            )}
          </div>
        )}
      </div>

      <button
        onClick={handleSubmit}
        disabled={!canSubmit}
        className="w-full rounded bg-violet-600 px-4 py-3 text-sm font-semibold text-white hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
      >
        Calculate Cost Estimate →
      </button>
    </div>
  );
}
