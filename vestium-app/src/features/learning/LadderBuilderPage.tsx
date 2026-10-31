import { useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Card } from '../../components/Card';
import { useTheme } from '../../lib/training-core/ThemeContext';
import { resolveToolAvailability } from '../../lib/training-core/tooling';

type SlotId = string;

// ─── PLC ladder builder types ─────────────────────────────────────────────────
type PaletteItem = {
  id: string;
  label: string;
  kind: 'contact' | 'coil' | 'block';
  style?: 'no' | 'nc';
};

type SlotSpec = {
  id: SlotId;
  expectedPaletteId: string;
  label: string;
};

type BuilderExercise = {
  id: string;
  title: string;
  objective: string;
  whyItMatters: string;
  templateType: 'seal-in' | 'series';
  palette: PaletteItem[];
  slots: SlotSpec[];
  sampleCases: Array<{
    id: string;
    inputs: Record<string, boolean>;
    expectedOutput: boolean;
    note: string;
  }>;
};

// ─── Regulatory risk control sequencer types ──────────────────────────────────
type RegulatoryExercise = {
  id: string;
  title: string;
  templateType: string;
  paletteItems: string[];
  requiredSlots: string[];
  validationLogic: string;
  testCases: Array<{ id: string; input: string; expected: string }>;
};

// ─── PLC helpers ──────────────────────────────────────────────────────────────
const contactGlyph = (item?: PaletteItem | null) => {
  if (!item) return '[ ? ]';
  if (item.kind === 'coil') return `(${item.label})`;
  if (item.kind === 'block') return `{ ${item.label} }`;
  return item.style === 'nc' ? `${item.label} ]/[` : `${item.label} [ ]`;
};

const buildExpectedMap = (exercise: BuilderExercise): Record<SlotId, string> =>
  Object.fromEntries(exercise.slots.map((slot) => [slot.id, slot.expectedPaletteId]));

const buildCaseMatches = (
  exercise: BuilderExercise,
  assignments: Record<SlotId, string>,
  paletteById: Record<string, PaletteItem>
): Array<{ id: string; pass: boolean; note: string; expectedOutput: boolean }> => {
  const expectedMap = buildExpectedMap(exercise);
  const structurallyCorrect = exercise.slots.every((slot) => assignments[slot.id] === expectedMap[slot.id]);
  const evalContact = (item: PaletteItem | undefined, inputs: Record<string, boolean>): boolean => {
    if (!item) return false;
    if (item.kind === 'block') return true;
    if (item.kind === 'coil') return true;
    const raw = Boolean(inputs[item.label]);
    return item.style === 'nc' ? !raw : raw;
  };
  const simulateOutput = (sample: BuilderExercise['sampleCases'][number]): boolean => {
    if (exercise.templateType === 'seal-in') {
      const top = evalContact(paletteById[assignments.branch_top], sample.inputs);
      const bottom = evalContact(paletteById[assignments.branch_bottom], sample.inputs);
      const s1 = evalContact(paletteById[assignments.series_1], sample.inputs);
      const s2 = evalContact(paletteById[assignments.series_2], sample.inputs);
      return (top || bottom) && s1 && s2;
    }
    return ['series_1', 'series_2', 'series_3'].every((slotId) =>
      evalContact(paletteById[assignments[slotId]], sample.inputs)
    );
  };
  return exercise.sampleCases.map((sample) => ({
    id: sample.id,
    pass: exercise.slots.every((slot) => assignments[slot.id]) ? simulateOutput(sample) === sample.expectedOutput : structurallyCorrect,
    note: sample.note,
    expectedOutput: sample.expectedOutput
  }));
};

// ─── Regulatory Risk Control Sequencer ───────────────────────────────────────
const RegulatoryBuilder = ({
  exercises,
  pageTitle
}: {
  exercises: RegulatoryExercise[];
  pageTitle: string;
}) => {
  const [selectedId, setSelectedId] = useState<string>(() => exercises[0]?.id ?? '');
  const [assignments, setAssignments] = useState<Record<string, Record<string, string>>>({});
  const [activeSlot, setActiveSlot] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const exercise = exercises.find((e) => e.id === selectedId) ?? exercises[0];

  if (!exercise) return null;

  const slotCount = exercise.requiredSlots.length;
  const shuffledItems = useMemo(() => {
    return [...exercise.paletteItems].sort(() => 0);
    // Deliberately not shuffled — order from model is consistent; shuffle would need stable seed
  }, [exercise.paletteItems]);

  const currentAssignments = assignments[exercise.id] ?? {};

  const setSlot = (slotIndex: number, item: string) => {
    setAssignments((prev) => ({
      ...prev,
      [exercise.id]: { ...(prev[exercise.id] ?? {}), [String(slotIndex)]: item }
    }));
    setActiveSlot(null);
  };

  const clearSlot = (slotIndex: number) => {
    setAssignments((prev) => {
      const copy = { ...(prev[exercise.id] ?? {}) };
      delete copy[String(slotIndex)];
      return { ...prev, [exercise.id]: copy };
    });
  };

  const resetExercise = () => {
    setAssignments((prev) => ({ ...prev, [exercise.id]: {} }));
    setSubmitted(false);
    setActiveSlot(null);
  };

  const slotResults = submitted
    ? exercise.requiredSlots.map((required, i) => ({
        index: i,
        assigned: currentAssignments[String(i)] ?? '',
        correct: currentAssignments[String(i)] === required,
        required
      }))
    : [];

  const allFilled = exercise.requiredSlots.every((_, i) => Boolean(currentAssignments[String(i)]));
  const allCorrect = slotResults.length > 0 && slotResults.every((s) => s.correct);

  return (
    <div className="space-y-4">
      <Card title={pageTitle}>
        <p className="text-sm text-theme-secondary">
          Risk control sequencer — select the correct controls in the right priority order.
          Based on the hierarchy of controls (MHSWR 1999, Reg 16 / L21 guidance).
        </p>
      </Card>

      <Card title="Exercise">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={exercise.id}
            onChange={(e) => {
              setSelectedId(e.target.value);
              setActiveSlot(null);
              setSubmitted(false);
            }}
            className="rounded border border-theme-border bg-theme-panel px-2 py-2 text-xs text-theme-text"
            aria-label="Select exercise"
          >
            {exercises.map((ex) => (
              <option key={ex.id} value={ex.id}>
                {ex.title}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={resetExercise}
            className="rounded border border-theme-border px-3 py-2 text-xs text-theme-text hover:border-theme-border"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={() => setSubmitted(true)}
            disabled={!allFilled}
            className="rounded bg-amber-500 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Check Sequence
          </button>
        </div>
        <p className="mt-3 text-sm text-theme-text font-semibold">{exercise.title}</p>
        <p className="mt-1 text-xs text-theme-secondary">Type: {exercise.templateType}</p>
        {exercise.validationLogic ? (
          <p className="mt-2 text-xs text-theme-secondary">{exercise.validationLogic}</p>
        ) : null}
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        {/* Slots */}
        <Card title={`Control Sequence${activeSlot !== null ? ` — assigning slot ${activeSlot + 1}` : ''}`}>
          <p className="mb-3 text-xs text-theme-secondary">
            Arrange controls in priority order (1 = highest priority). Click a slot, then click
            a control from the palette to assign it.
          </p>
          <div className="space-y-2">
            {Array.from({ length: slotCount }, (_, i) => {
              const assigned = currentAssignments[String(i)];
              const isActive = activeSlot === i;
              const slotResult = slotResults[i];
              const showError = submitted && slotResult && !slotResult.correct;
              const showOk = submitted && slotResult && slotResult.correct;
              return (
                <div key={i} className="flex items-start gap-2">
                  <span className="mt-2 w-5 shrink-0 text-center text-xs text-theme-muted font-bold">
                    {i + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => setActiveSlot(isActive ? null : i)}
                    className={`flex-1 rounded border px-3 py-2 text-left text-xs transition-colors ${
                      showError
                        ? 'border-rose-500/60 bg-rose-500/10 text-rose-200'
                        : showOk
                          ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-200'
                          : isActive
                            ? 'border-amber-500/60 bg-amber-500/10 text-amber-100'
                            : 'border-theme-border bg-theme-base text-theme-text hover:border-theme-border'
                    }`}
                  >
                    {assigned ? assigned : <span className="text-theme-muted">[ empty — click to select ]</span>}
                  </button>
                  {assigned ? (
                    <button
                      type="button"
                      onClick={() => clearSlot(i)}
                      className="mt-2 text-xs text-theme-muted hover:text-theme-secondary"
                    >
                      ✕
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>

          {submitted ? (
            <div className="mt-4 rounded border border-theme-border bg-theme-base p-3">
              <p className={`text-sm font-semibold ${allCorrect ? 'text-emerald-300' : 'text-rose-300'}`}>
                {allCorrect
                  ? 'Correct sequence — all controls in the right order.'
                  : `${slotResults.filter((s) => s.correct).length}/${slotCount} controls in the correct position.`}
              </p>
              {!allCorrect ? (
                <div className="mt-2 space-y-1 text-xs">
                  {slotResults.filter((s) => !s.correct).map((s) => (
                    <p key={s.index} className="text-rose-200">
                      Slot {s.index + 1}: expected <span className="font-semibold">{s.required}</span>
                      {s.assigned ? <>, got <span className="font-semibold">{s.assigned}</span></> : ', nothing assigned'}
                    </p>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </Card>

        {/* Palette */}
        <Card title="Control Measures">
          <p className="mb-3 text-xs text-theme-secondary">
            {activeSlot !== null
              ? `Assigning slot ${activeSlot + 1} — click a control to place it.`
              : 'Click a sequence slot first, then select a control from this list.'}
          </p>
          <div className="space-y-2">
            {shuffledItems.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => {
                  if (activeSlot !== null) setSlot(activeSlot, item);
                }}
                disabled={activeSlot === null}
                className="w-full rounded border border-theme-border bg-theme-base px-3 py-2 text-left text-xs text-theme-text hover:border-theme-border disabled:cursor-not-allowed disabled:opacity-50"
              >
                {item}
              </button>
            ))}
          </div>

          {/* Test cases revealed after submit */}
          {submitted && exercise.testCases.length > 0 ? (
            <div className="mt-4">
              <p className="text-xs font-semibold text-theme-secondary">Worked Examples</p>
              <div className="mt-2 space-y-2 text-xs">
                {exercise.testCases.map((tc) => (
                  <div key={tc.id} className="rounded border border-theme-border bg-theme-base p-2">
                    <p className="text-theme-secondary">{tc.input}</p>
                    <p className="mt-1 text-emerald-300">→ {tc.expected}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </Card>
      </div>
    </div>
  );
};

// ─── Main export ──────────────────────────────────────────────────────────────
export const LadderBuilderPage = () => {
  const { currentTheme } = useTheme();

  const allExercises = (currentTheme.simulatorData?.builderExercises ?? []) as (BuilderExercise | RegulatoryExercise)[];

  // Detect format: PLC ladder exercises have a `palette` array of objects;
  // regulatory exercises have `paletteItems` (string array) and `requiredSlots`.
  const plcExercises = allExercises.filter(
    (ex): ex is BuilderExercise => Array.isArray((ex as BuilderExercise).palette)
  );
  const regulatoryExercises = allExercises.filter(
    (ex): ex is RegulatoryExercise =>
      Array.isArray((ex as RegulatoryExercise).paletteItems) &&
      Array.isArray((ex as RegulatoryExercise).requiredSlots)
  );

  const toolAvailability = resolveToolAvailability(currentTheme);
  const hasPlcMode = toolAvailability.builder && plcExercises.length > 0;
  const hasRegulatoryMode = regulatoryExercises.length > 0;

  // All hooks must be declared before any conditional return
  const [selectedExerciseId, setSelectedExerciseId] = useState<string>(() => plcExercises[0]?.id ?? '');
  const [activeSlotId, setActiveSlotId] = useState<SlotId | null>(null);
  const [assignmentsByExercise, setAssignmentsByExercise] = useState<Record<string, Record<SlotId, string>>>({});
  const [submittedByExercise, setSubmittedByExercise] = useState<Record<string, boolean>>({});
  const [draggingPaletteId, setDraggingPaletteId] = useState<string | null>(null);

  const exercise = plcExercises.find((e) => e.id === selectedExerciseId) ?? plcExercises[0];
  const paletteById = useMemo(
    () => Object.fromEntries((exercise?.palette ?? []).map((item) => [item.id, item])),
    [exercise?.palette]
  );
  const assignments = assignmentsByExercise[exercise?.id ?? ''] ?? {};
  const submitted = Boolean(submittedByExercise[exercise?.id ?? '']);

  const validation = useMemo(() => {
    if (!exercise) return { slotResults: [], allSlotsFilled: false, correctCount: 0, allCorrect: false, caseResults: [] };
    const slotResults = exercise.slots.map((slot) => ({
      ...slot,
      assignedId: assignments[slot.id],
      correct: assignments[slot.id] === slot.expectedPaletteId
    }));
    const allSlotsFilled = exercise.slots.every((slot) => Boolean(assignments[slot.id]));
    const correctCount = slotResults.filter((slot) => slot.correct).length;
    const allCorrect = allSlotsFilled && correctCount === exercise.slots.length;
    const caseResults = buildCaseMatches(exercise, assignments, paletteById);
    return { slotResults, allSlotsFilled, correctCount, allCorrect, caseResults };
  }, [exercise, assignments, paletteById]);

  if (!hasPlcMode && !hasRegulatoryMode) {
    return <Navigate to={`/${currentTheme.id}/dashboard`} replace />;
  }

  // ─── Regulatory mode ───────────────────────────────────────────────────────
  if (!hasPlcMode && hasRegulatoryMode) {
    return (
      <RegulatoryBuilder
        exercises={regulatoryExercises}
        pageTitle={currentTheme.labels?.ladderBuilderTitle ?? 'Risk Control Sequence Builder'}
      />
    );
  }

  // ─── PLC ladder builder mode ───────────────────────────────────────────────
  if (!exercise) return <Navigate to={`/${currentTheme.id}/dashboard`} replace />;

  const assignToSlot = (paletteId: string) => {
    if (!activeSlotId) return;
    setAssignmentsByExercise((prev) => ({
      ...prev,
      [exercise.id]: {
        ...(prev[exercise.id] ?? {}),
        [activeSlotId]: paletteId
      }
    }));
  };

  const clearSlot = (slotId: SlotId) => {
    setAssignmentsByExercise((prev) => {
      const current = { ...(prev[exercise.id] ?? {}) };
      delete current[slotId];
      return { ...prev, [exercise.id]: current };
    });
  };

  const resetExercise = () => {
    setAssignmentsByExercise((prev) => ({ ...prev, [exercise.id]: {} }));
    setSubmittedByExercise((prev) => ({ ...prev, [exercise.id]: false }));
    setActiveSlotId(null);
  };

  const submitBuild = () => {
    setSubmittedByExercise((prev) => ({ ...prev, [exercise.id]: true }));
  };

  const renderSlotButton = (slotId: SlotId, hint: string) => {
    const item = assignments[slotId] ? paletteById[assignments[slotId]] : null;
    const isActive = activeSlotId === slotId;
    const slotValidation = validation.slotResults.find((s) => s.id === slotId);
    const showError = submitted && slotValidation && !slotValidation.correct;
    return (
      <button
        type="button"
        onClick={() => setActiveSlotId(slotId)}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          const paletteId = event.dataTransfer.getData('text/plain') || draggingPaletteId;
          if (paletteId) {
            setActiveSlotId(slotId);
            setAssignmentsByExercise((prev) => ({
              ...prev,
              [exercise.id]: {
                ...(prev[exercise.id] ?? {}),
                [slotId]: paletteId
              }
            }));
          }
          setDraggingPaletteId(null);
        }}
        className={`rounded border px-3 py-2 text-left text-xs font-mono transition-colors ${
          showError
            ? 'border-rose-500/60 bg-rose-500/10 text-rose-200'
            : isActive
              ? 'border-amber-500/60 bg-amber-500/10 text-amber-100'
              : 'border-theme-border bg-theme-base text-theme-text hover:border-theme-border'
        }`}
      >
        <div className="text-[10px] text-theme-secondary">{hint}</div>
        <div className="mt-1">{item ? contactGlyph(item) : '[ empty ]'}</div>
      </button>
    );
  };

  return (
    <div className="space-y-4">
      <Card title={currentTheme.labels?.ladderBuilderTitle ?? 'Ladder Builder'}>
        <p className="text-sm text-theme-secondary">
          Constrained rung-writing editor with branch templates, drag/drop placement, instruction blocks (TON/CTU/OSR), and sample behavior validation.
        </p>
      </Card>

      <Card title="Exercise">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={exercise.id}
            onChange={(event) => {
              setSelectedExerciseId(event.target.value);
              setActiveSlotId(null);
            }}
            className="rounded border border-theme-border bg-theme-panel px-2 py-2 text-xs text-theme-text"
            aria-label="Select ladder builder exercise"
          >
            {plcExercises.map((ex) => (
              <option key={ex.id} value={ex.id}>
                {ex.title}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={resetExercise}
            className="rounded border border-theme-border px-3 py-2 text-xs text-theme-text hover:border-theme-border"
          >
            Reset Exercise
          </button>
          <button
            type="button"
            onClick={submitBuild}
            className="rounded bg-amber-500 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400"
          >
            Validate Build
          </button>
        </div>
        <p className="mt-3 text-sm text-theme-text">{exercise.objective}</p>
        <p className="mt-1 text-xs text-theme-secondary">Why it matters: {exercise.whyItMatters}</p>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <Card title="Rung Canvas">
          {exercise.templateType === 'seal-in' ? (
            <div className="rounded border border-theme-border bg-theme-base p-3">
              <div className="flex items-start gap-3">
                <div className="pt-8 text-theme-muted">|</div>
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-theme-muted">--</span>
                    {renderSlotButton('branch_top', 'Top branch')}
                    <span className="text-theme-muted">--</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-theme-muted">--</span>
                    {renderSlotButton('branch_bottom', 'Bottom branch')}
                    <span className="text-theme-muted">--</span>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-theme-muted">join --</span>
                    {renderSlotButton('series_1', 'Series 1')}
                    <span className="text-theme-muted">--</span>
                    {renderSlotButton('series_2', 'Series 2')}
                    <span className="text-theme-muted">--</span>
                    {renderSlotButton('coil', 'Coil')}
                    <span className="text-theme-muted">--</span>
                  </div>
                </div>
                <div className="pt-8 text-theme-muted">|</div>
              </div>
            </div>
          ) : (
            <div className="rounded border border-theme-border bg-theme-base p-3">
              <div className="flex items-center gap-2">
                <span className="text-theme-muted">|</span>
                <span className="text-theme-muted">--</span>
                {renderSlotButton('series_1', 'Series 1')}
                <span className="text-theme-muted">--</span>
                {renderSlotButton('series_2', 'Series 2')}
                <span className="text-theme-muted">--</span>
                {renderSlotButton('series_3', 'Series 3')}
                <span className="text-theme-muted">--</span>
                {renderSlotButton('coil', 'Coil')}
                <span className="text-theme-muted">--</span>
                <span className="text-theme-muted">|</span>
              </div>
            </div>
          )}

          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {exercise.slots.map((slot) => (
              <div key={slot.id} className="rounded border border-theme-border bg-theme-base p-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-theme-secondary">{slot.label}</p>
                  <div className="flex items-center gap-2">
                    {submitted ? (
                      <span className={validation.slotResults.find((s) => s.id === slot.id)?.correct ? 'text-emerald-300' : 'text-rose-300'}>
                        {validation.slotResults.find((s) => s.id === slot.id)?.correct ? 'Correct' : 'Wrong'}
                      </span>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => clearSlot(slot.id)}
                      className="text-theme-secondary hover:text-theme-text"
                    >
                      Clear
                    </button>
                  </div>
                </div>
                <p className="mt-1 font-mono text-theme-text">
                  {assignments[slot.id] ? contactGlyph(paletteById[assignments[slot.id]]) : '[ empty ]'}
                </p>
              </div>
            ))}
          </div>
        </Card>

        <div className="space-y-4">
          <Card title={`Palette${activeSlotId ? ` • Assign to ${activeSlotId}` : ''}`}>
            <p className="mb-3 text-xs text-theme-secondary">
              Select a slot, click to place, or drag a palette item directly onto the rung canvas.
            </p>
            <div className="grid gap-2">
              {exercise.palette.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.setData('text/plain', item.id);
                    setDraggingPaletteId(item.id);
                  }}
                  onDragEnd={() => setDraggingPaletteId(null)}
                  onClick={() => assignToSlot(item.id)}
                  disabled={!activeSlotId}
                  className="rounded border border-theme-border bg-theme-base px-3 py-2 text-left text-xs font-mono text-theme-text hover:border-theme-border disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {contactGlyph(item)}
                </button>
              ))}
            </div>
          </Card>

          <Card title="Validation">
            {!submitted ? (
              <p className="text-xs text-theme-secondary">
                Build the rung and press <span className="text-amber-300">Validate Build</span> for slot-by-slot feedback and sample-case checks.
              </p>
            ) : (
              <div className="space-y-3">
                <p className={`text-sm font-semibold ${validation.allCorrect ? 'text-emerald-300' : 'text-rose-300'}`}>
                  {validation.allCorrect
                    ? 'Rung build is structurally correct.'
                    : `Rung build incomplete/incorrect (${validation.correctCount}/${exercise.slots.length} slots correct).`}
                </p>
                <div className="space-y-2">
                  {validation.slotResults
                    .filter((slot) => !slot.correct)
                    .map((slot) => {
                      const expected = paletteById[slot.expectedPaletteId];
                      return (
                        <p key={slot.id} className="text-xs text-rose-200">
                          {slot.label}: expected <span className="font-mono">{contactGlyph(expected)}</span>
                        </p>
                      );
                    })}
                  {validation.slotResults.every((slot) => slot.correct) ? (
                    <p className="text-xs text-emerald-300">All slots match the intended rung pattern.</p>
                  ) : null}
                  {submitted && exercise.id === 'ctu-edge-trigger' && assignments['series_2'] !== 'osr_block' ? (
                    <p className="text-xs text-amber-200">
                      Coaching: this pattern needs an explicit one-shot before the CTU path. A latched/high signal will not create repeated rising edges.
                    </p>
                  ) : null}
                  {submitted && exercise.id === 'ton-lamp-delay' && assignments['series_2'] !== 'ton_t1' ? (
                    <p className="text-xs text-amber-200">
                      Coaching: place the timer block in the execution path, then use the timer done contact to drive the delayed output.
                    </p>
                  ) : null}
                </div>
                <div className="rounded border border-theme-border bg-theme-base p-3">
                  <p className="text-xs font-semibold text-theme-secondary">Sample Behavior Checks</p>
                  <div className="mt-2 space-y-2">
                    {validation.caseResults.map((result) => (
                      <div key={result.id} className="rounded border border-theme-border p-2">
                        <p className={`text-xs font-semibold ${result.pass ? 'text-emerald-300' : 'text-rose-300'}`}>
                          {result.pass ? 'Pass' : 'Fail'} • Expected output {result.expectedOutput ? 'TRUE' : 'FALSE'}
                        </p>
                        <p className="mt-1 text-[11px] text-theme-secondary">{result.note}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
};
