import { Link, Navigate, useParams } from 'react-router-dom';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Card } from '../../components/Card';
import { DiagramRenderer } from '../../components/DiagramRenderer';
import { GlossaryText } from '../../components/GlossaryText';
import { Quiz } from '../../components/Quiz';
import { YouTry } from '../../components/YouTry';
import { VerbalQuestionModal } from './VerbalQuestionModal';
import { ConsentModal } from './ConsentModal';
import { getTrainingLessonMissionRequirement, getTrainingMissionById } from '../../lib/training-core/simulator';
import { useTheme } from '../../lib/training-core/ThemeContext';
import { useProgress } from '../progress/ProgressContext';
import { canAttemptStageTest, isStageUnlocked } from '../progress/gating';
import { LESSON_PASS_SCORE } from '../../utils/constants';
import { LAST_ACTIVE_LESSON_KEY } from '../../utils/constants';
import type { TrainingQuestion } from '../../lib/training-core/types';

const splitIntoSentences = (text: string): string[] =>
  text
    .split(/(?<=[.!?])\s+/)
    .map((segment) => segment.trim())
    .filter(Boolean);

const buildLessonSituationHook = (lesson: { situationHook?: string; workedExample: string; objective: string }): string => {
  if (lesson.situationHook?.trim()) return lesson.situationHook.trim();
  const workedSentences = splitIntoSentences(lesson.workedExample);
  const scenarioLead = workedSentences.slice(0, 2).join(' ');
  const whyMatters = `This matters because ${lesson.objective.charAt(0).toLowerCase()}${lesson.objective.slice(1).replace(/\.$/, '')}.`;
  return scenarioLead ? `${scenarioLead} ${whyMatters}` : whyMatters;
};

const buildComprehensionPrompt = (objective: string): string =>
  `Quick retrieval: In one or two sentences, how would you apply this lesson objective in a real task? (${objective.replace(/\.$/, '')})`;

export const LessonPage = () => {
  const { currentTheme, currentThemeId } = useTheme();
  const params = useParams();
  const stageId = Number(params.stageId);
  const lessonId = params.lessonId ?? '';
  const stage = currentTheme.curriculum.find((s) => s.id === stageId);
  const lesson = stage?.lessons.find((l) => l.id === lessonId);
  const { state, markLessonComplete, recordQuizResultsForReview } = useProgress();
  const labels = currentTheme.labels ?? {};
  const simulatorLabel = currentTheme.terms?.simulatorLabel ?? 'Simulator';
  const [quizGateMessage, setQuizGateMessage] = useState<string | null>(null);
  const nextStepRef = useRef<HTMLDivElement | null>(null);

  // ─── Hooks that must be declared before any conditional return ────────────
  // useMemo/useState after a conditional return violates React's Rules of Hooks.
  // Keep these here even though their values depend on lesson/stage below.
  const [comprehensionResponse, setComprehensionResponse] = useState('');
  const [showComprehensionModel, setShowComprehensionModel] = useState(false);

  const unmetMissionIds = useMemo(() => {
    if (!lesson) return [];
    const req = getTrainingLessonMissionRequirement(lesson.id, currentThemeId);
    return (req?.missionIds ?? []).filter(
      (missionId) => !state.simulatorMissionsCompleted[missionId]
    );
  }, [lesson, currentThemeId, state.simulatorMissionsCompleted]);

  // ─── Verbal assessment — time-based trigger ───────────────────────────────
  // Fires once per lesson, at a random delay after the learner starts the quiz.
  // "Started" = quiz section scrolls into view (IntersectionObserver).
  // Random window: 30–90 s — unknown to the learner, creating genuine pressure.
  const quizSectionRef = useRef<HTMLDivElement>(null);
  const [activeVerbalQ, setActiveVerbalQ] = useState<TrainingQuestion | null>(null);
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [consentGranted, setConsentGranted] = useState(false);
  const pendingVerbalQRef = useRef<TrainingQuestion | null>(null);
  const verbalFiredRef = useRef(false);
  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    verbalFiredRef.current = false;
    if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current);
    pendingTimerRef.current = null;
  }, [lesson?.id]);

  useEffect(() => {
    if (!lesson) return;
    const verbal = lesson.quiz.filter(q => q.type === 'verbal');
    if (verbal.length === 0) return;
    const vq = verbal[0]!;

    const fireVerbal = () => {
      if (verbalFiredRef.current) return;
      verbalFiredRef.current = true;
      if (consentGranted) {
        setActiveVerbalQ(vq);
      } else {
        pendingVerbalQRef.current = vq;
        setShowConsentModal(true);
      }
    };

    const startTimer = () => {
      if (verbalFiredRef.current || pendingTimerRef.current) return;
      // Random delay: 30–90 seconds after quiz section enters view
      const delayMs = Math.floor(Math.random() * 60_000) + 30_000;
      pendingTimerRef.current = setTimeout(fireVerbal, delayMs);
    };

    const observer = new IntersectionObserver(
      (entries) => { if (entries[0]?.isIntersecting) startTimer(); },
      { threshold: 0.25 }
    );

    const el = quizSectionRef.current;
    if (el) observer.observe(el);

    return () => {
      observer.disconnect();
      if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current);
    };
  }, [lesson?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!stage || !lesson) return <Navigate to="/" replace />;
  if (!isStageUnlocked(state, stage.id)) return <Navigate to="/" replace />;

  const missionRequirement = getTrainingLessonMissionRequirement(lesson.id, currentThemeId);
  const practicalGateSatisfied = unmetMissionIds.length === 0;
  const currentLessonIndex = stage.lessons.findIndex((l) => l.id === lesson.id);
  const prevLesson = currentLessonIndex > 0 ? stage.lessons[currentLessonIndex - 1] : null;
  const nextLesson = stage.lessons[currentLessonIndex + 1] ?? null;
  const stageTestAvailable = canAttemptStageTest(state, stage);
  const situationHook = buildLessonSituationHook(lesson);
  const completionNextCta = state.lessonsCompleted[lesson.id]
    ? nextLesson
      ? {
          to: `/stage/${stage.id}/lesson/${nextLesson.id}`,
          label: `→ Continue: "${nextLesson.title}"`
        }
      : stageTestAvailable
        ? {
            to: `/stage/${stage.id}/test`,
            label: `→ Take Stage ${stage.id} Test`
          }
        : {
            to: `/stage/${stage.id}`,
            label: `→ Back to Stage ${stage.id}`
          }
    : null;

  useEffect(() => {
    if (!state.lessonsCompleted[lesson.id]) return;
    if (!nextStepRef.current) return;
    nextStepRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [lesson.id, state.lessonsCompleted]);

  useEffect(() => {
    try {
      localStorage.setItem(
        LAST_ACTIVE_LESSON_KEY,
        JSON.stringify({
          themeId: currentTheme.id,
          stageId: stage.id,
          lessonId: lesson.id,
          lessonTitle: lesson.title,
          path: `/${currentTheme.id}/stage/${stage.id}/lesson/${lesson.id}`,
          updatedAt: new Date().toISOString()
        })
      );
    } catch {
      // Ignore storage failures.
    }
  }, [currentTheme.id, lesson.id, lesson.title, stage.id]);

  // Lesson rule: one verbal question per lesson (consumed by time-based trigger above).
  const mcqQuestions = lesson.quiz.filter(q => q.type !== 'verbal');

  let sectionIndexCursor = 1;
  const sectionOverview = sectionIndexCursor++;
  const sectionMission = missionRequirement ? sectionIndexCursor++ : null;
  const sectionSituationHook = sectionIndexCursor++;
  const sectionConcept = sectionIndexCursor++;
  const sectionDiagrams = sectionIndexCursor++;
  const sectionScenario = sectionIndexCursor++;
  const sectionQuiz = sectionIndexCursor++;
  const totalSections = sectionIndexCursor - 1;
  const sectionTitle = (index: number, title: string) => `Section ${index + 1} of ${totalSections} - ${title}`;
  const conceptInsertIndex = lesson.concept.length >= 4 ? 2 : 1;
  const comprehensionPrompt = buildComprehensionPrompt(lesson.objective);
  const comprehensionModel = splitIntoSentences(lesson.workedExample).slice(0, 2).join(' ');

  return (
    <div className="space-y-4">
      <nav aria-label="breadcrumb" className="text-xs text-theme-secondary flex items-center gap-1.5">
        <Link to="/" className="hover:text-amber-300">Dashboard</Link>
        <span>/</span>
        <Link to={`/stage/${stage.id}`} className="hover:text-amber-300">
          Stage {stage.id}: {stage.title}
        </Link>
        <span>/</span>
        <span className="text-theme-text">{lesson.title}</span>
      </nav>

      <Card title="Lesson Navigation">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="text-theme-secondary">
            Lesson {currentLessonIndex + 1} of {stage.lessons.length}
          </span>
          <div className="flex flex-wrap gap-2">
            {prevLesson ? (
              <Link
                to={`/stage/${stage.id}/lesson/${prevLesson.id}`}
                className="rounded border border-theme-border px-2 py-1 text-theme-text hover:border-theme-border"
              >
                Previous: {prevLesson.title}
              </Link>
            ) : null}
            {nextLesson ? (
              <Link
                to={`/stage/${stage.id}/lesson/${nextLesson.id}`}
                className="rounded border border-theme-border px-2 py-1 text-theme-text hover:border-theme-border"
              >
                Next: {nextLesson.title}
              </Link>
            ) : (
              <Link
                to={`/stage/${stage.id}/test`}
                className="rounded border border-amber-500/40 px-2 py-1 text-amber-200 hover:bg-amber-500/10"
              >
                Next: Stage Test
              </Link>
            )}
          </div>
        </div>
      </Card>

      <Card title={sectionTitle(sectionOverview - 1, lesson.title)}>
        <p className="text-sm text-theme-secondary">Objective: {lesson.objective}</p>
        <div className="mt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-theme-secondary">Lesson Progress</p>
          <div className="mt-1 h-2 w-full overflow-hidden rounded bg-theme-surface">
            <div className="h-full bg-amber-500/70" style={{ width: `${Math.round((sectionOverview / totalSections) * 100)}%` }} />
          </div>
          <p className="mt-1 text-xs text-theme-muted">Section {sectionOverview} of {totalSections}</p>
        </div>
        {lesson.readingMinutes ? (
          <p className="mt-1 text-xs text-theme-secondary">Estimated session time: ~{lesson.readingMinutes} min</p>
        ) : null}
        {state.lessonsCompleted[lesson.id] ? (
          <p className="mt-2 text-xs text-emerald-300">Lesson complete. XP already awarded.</p>
        ) : (
          <p className="mt-2 text-xs text-theme-secondary">
            Pass quiz at {LESSON_PASS_SCORE}% or above to complete this lesson.
            {missionRequirement ? ' This lesson also requires simulator mission completion.' : ''}
          </p>
        )}
      </Card>

      {missionRequirement ? (
        <Card title={sectionTitle((sectionMission ?? 1) - 1, labels.lessonPracticalGateTitle ?? `Practical Gate (${simulatorLabel} Mission)`)}>
          <p className="text-sm text-theme-secondary">{missionRequirement.rationale}</p>
          <ul className="mt-3 space-y-2 text-xs">
            {missionRequirement.missionIds.map((missionId) => {
              const done = Boolean(state.simulatorMissionsCompleted[missionId]);
              return (
                <li
                  key={missionId}
                  className={`rounded border p-2 ${
                    done
                      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                      : 'border-theme-border bg-theme-base text-theme-secondary'
                  }`}
                >
                  {done ? 'Complete' : 'Pending'}:{' '}
                  <span className="font-medium">
                    {getTrainingMissionById(missionId, currentThemeId)?.title ?? missionId}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-xs text-theme-secondary">
            Complete these in the stage {simulatorLabel.toLowerCase()}, then return here and pass the quiz.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {missionRequirement.missionIds.map((missionId) => (
              <Link
                key={missionId}
                to={`/stage/${stage.id}?mission=${encodeURIComponent(missionId)}`}
                className="rounded border border-theme-border px-3 py-2 text-xs text-theme-text"
              >
                Open Mission: {getTrainingMissionById(missionId, currentThemeId)?.title ?? missionId}
              </Link>
            ))}
          </div>
        </Card>
      ) : null}

      <Card title={sectionTitle(sectionSituationHook - 1, labels.lessonSituationHookTitle ?? 'Situation Hook')}>
        <p className="text-sm text-theme-text">{situationHook}</p>
      </Card>

      <Card title={sectionTitle(sectionConcept - 1, labels.lessonConceptTitle ?? 'Concept Explanation')}>
        <div className="space-y-3 text-sm text-theme-text">
          {lesson.concept.map((paragraph, idx) => {
            const isInsertionPoint = idx === conceptInsertIndex - 1 && lesson.concept.length >= 3;
            return (
              <div key={idx} className="space-y-3">
                <p>
                  <GlossaryText text={paragraph} />
                </p>
                {isInsertionPoint ? (
                  <div className="rounded border border-amber-500/30 bg-amber-500/5 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-amber-200">Mid-Concept Check</p>
                    <p className="mt-1 text-xs text-theme-text">{comprehensionPrompt}</p>
                    <textarea
                      value={comprehensionResponse}
                      onChange={(event) => setComprehensionResponse(event.target.value)}
                      rows={2}
                      className="mt-2 w-full rounded border border-theme-border bg-theme-base px-2 py-1 text-xs text-theme-text"
                      placeholder="Type your brief answer..."
                    />
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={() => setShowComprehensionModel((prev) => !prev)}
                        className="rounded border border-theme-border px-2 py-1 text-[11px] text-theme-text hover:border-theme-border"
                      >
                        {showComprehensionModel ? 'Hide example response' : 'Show example response'}
                      </button>
                    </div>
                    {showComprehensionModel ? (
                      <p className="mt-2 text-xs text-theme-secondary">{comprehensionModel}</p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </Card>

      <Card title={sectionTitle(sectionDiagrams - 1, 'Diagrams')}>
        <div className="space-y-4">
          {lesson.diagrams.map((diagram) => (
            <DiagramRenderer key={diagram.id} diagram={diagram} />
          ))}
        </div>
      </Card>

      <Card title={sectionTitle(sectionScenario - 1, labels.lessonScenarioTitle ?? 'Real Scenario')}>
        <p className="text-sm text-theme-text">{lesson.workedExample}</p>
      </Card>

      <YouTry item={lesson.youTry} lessonId={lesson.id} />

      <div ref={quizSectionRef}>
      <Quiz
        title={sectionTitle(sectionQuiz - 1, labels.lessonKnowledgeCheckTitle ?? 'Knowledge Check')}
        questions={mcqQuestions}
        passScore={LESSON_PASS_SCORE}
        allowPracticeMode={true}
        onDetailedSubmit={({ questions, answers }) => {
          recordQuizResultsForReview(
            {
              sourceType: 'lesson',
              themeId: currentTheme.id,
              stageId: stage.id,
              lessonId: lesson.id,
              sourceTitle: lesson.title
            },
            questions,
            answers
          );
        }}
        onPass={() => {
          if (!practicalGateSatisfied) {
            const missionTitles = unmetMissionIds.map(
              (missionId) => getTrainingMissionById(missionId, currentThemeId)?.title ?? missionId
            );
            setQuizGateMessage(
              `Quiz passed, but lesson completion is still waiting on ${simulatorLabel.toLowerCase()} practice. Complete: ${missionTitles.join(
                ', '
              )}.`
            );
            return;
          }
          setQuizGateMessage(null);
          markLessonComplete(lesson.id);
        }}
        completionSuccessContent={
          completionNextCta ? (
            <div ref={nextStepRef} className="rounded border border-emerald-500/30 bg-emerald-500/5 p-3">
              <p className="mb-2 text-xs uppercase tracking-wider text-emerald-300">
                Next Step
              </p>
              <Link
                to={completionNextCta.to}
                className="block w-full rounded bg-amber-500 px-4 py-2 text-center text-sm font-semibold text-slate-950 hover:bg-amber-400"
              >
                {completionNextCta.label}
              </Link>
            </div>
          ) : null
        }
      />
      </div>

      {quizGateMessage ? (
        <Card title={labels.lessonCompletionGateTitle ?? 'Completion Gate'}>
          <p className="text-sm text-amber-200">{quizGateMessage}</p>
        </Card>
      ) : null}

      <div className="flex justify-end">
        <Link to={`/stage/${stage.id}`} className="rounded border border-theme-border px-3 py-2 text-xs text-theme-text">
          Back to Stage
        </Link>
      </div>

      {showConsentModal && (
        <ConsentModal
          onConsented={() => {
            setConsentGranted(true);
            setShowConsentModal(false);
            if (pendingVerbalQRef.current) {
              setActiveVerbalQ(pendingVerbalQRef.current);
              pendingVerbalQRef.current = null;
            }
          }}
          onDeclined={() => {
            setShowConsentModal(false);
            pendingVerbalQRef.current = null;
          }}
        />
      )}
      {activeVerbalQ && (
        <VerbalQuestionModal
          question={activeVerbalQ}
          moduleId={currentTheme.id}
          lessonId={lesson.id}
          onComplete={() => setActiveVerbalQ(null)}
        />
      )}
    </div>
  );
};
