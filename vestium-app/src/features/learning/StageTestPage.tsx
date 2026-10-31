import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useState } from 'react';
import { Card } from '../../components/Card';
import { Quiz } from '../../components/Quiz';
import { useTheme } from '../../lib/training-core/ThemeContext';
import { useProgress } from '../progress/ProgressContext';
import { canAttemptStageTest } from '../progress/gating';
import { STAGE_TEST_PASS_SCORE } from '../../utils/constants';
import type { TrainingQuestion, TrainingLesson } from '../../lib/training-core/types';

type StageDiagnostic = {
  score: number;
  passed: boolean;
  weakAreas: Array<{ lessonId: string; lessonTitle: string; missCount: number }>;
};

const normalize = (value: string): string[] =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 4);

const buildStageDiagnostic = (
  stage: { lessons: TrainingLesson[] },
  questions: TrainingQuestion[],
  answers: Record<string, string | boolean>,
  score: number,
  passed: boolean
): StageDiagnostic | null => {
  const missed = questions.filter((q) => answers[q.id] !== q.answer);
  if (missed.length === 0) {
    return {
      score,
      passed,
      weakAreas: []
    };
  }

  const lessonSignals = stage.lessons.map((lesson) => {
    const sourceText = `${lesson.title} ${lesson.objective} ${lesson.concept.join(' ')}`.toLowerCase();
    return {
      lessonId: lesson.id,
      lessonTitle: lesson.title,
      tokens: new Set(normalize(sourceText))
    };
  });

  const missesByLesson = new Map<string, { lessonId: string; lessonTitle: string; missCount: number }>();

  for (const question of missed) {
    const questionTokens = new Set(normalize(`${question.prompt} ${question.explanation}`));
    let bestMatch: { lessonId: string; lessonTitle: string; overlap: number } | null = null;
    for (const lesson of lessonSignals) {
      const overlap = Array.from(questionTokens).filter((token) => lesson.tokens.has(token)).length;
      if (!bestMatch || overlap > bestMatch.overlap) {
        bestMatch = { lessonId: lesson.lessonId, lessonTitle: lesson.lessonTitle, overlap };
      }
    }
    if (!bestMatch || bestMatch.overlap === 0) continue;
    const existing = missesByLesson.get(bestMatch.lessonId);
    missesByLesson.set(bestMatch.lessonId, {
      lessonId: bestMatch.lessonId,
      lessonTitle: bestMatch.lessonTitle,
      missCount: (existing?.missCount ?? 0) + 1
    });
  }

  return {
    score,
    passed,
    weakAreas: Array.from(missesByLesson.values()).sort((a, b) => b.missCount - a.missCount)
  };
};

export const StageTestPage = () => {
  const { currentTheme } = useTheme();
  const params = useParams();
  const navigate = useNavigate();
  const stageId = Number(params.stageId);
  const labels = currentTheme.labels ?? {};
  const stage = currentTheme.curriculum.find((s) => s.id === stageId);
  const { state, submitStageTest, recordQuizResultsForReview } = useProgress();
  const [diagnostic, setDiagnostic] = useState<StageDiagnostic | null>(null);

  if (!stage) return <Navigate to="/" replace />;
  if (!canAttemptStageTest(state, stage)) return <Navigate to={`/stage/${stage.id}`} replace />;

  return (
    <div className="space-y-4">
      <Card title={`Stage ${stage.id} Test`}>
        <p className="text-sm text-theme-secondary">
          Pass mark is {STAGE_TEST_PASS_SCORE}%. All lessons in this stage must be completed before this exam is available. Passing awards 25 XP once and unlocks the next stage.
        </p>
        {state.stageTestsPassed[stage.id] ? (
          <p className="mt-2 text-xs text-emerald-300">Already passed with {state.stageTestScores[stage.id]}%. Retakes allowed without extra XP.</p>
        ) : null}
      </Card>

      <Quiz
        title={labels.quizStageExamTitle ?? 'Stage Exam'}
        questions={stage.test}
        passScore={STAGE_TEST_PASS_SCORE}
        onDetailedSubmit={({ questions, answers, score, passed }) => {
          setDiagnostic(buildStageDiagnostic(stage, questions, answers, score, passed));
          recordQuizResultsForReview(
            {
              sourceType: 'stageTest',
              themeId: currentTheme.id,
              stageId: stage.id,
              sourceTitle: `Stage ${stage.id} Test`
            },
            questions,
            answers
          );
          submitStageTest(stage.id, score, passed);
        }}
      />

      {diagnostic ? (
        <Card title="Diagnostic Summary">
          <p className="text-sm text-theme-secondary">
            {diagnostic.passed
              ? `Stage test passed at ${diagnostic.score}%.`
              : `Stage test score ${diagnostic.score}%. Focus these areas before your next attempt.`}
          </p>
          {diagnostic.weakAreas.length > 0 ? (
            <ul className="mt-3 space-y-2 text-xs">
              {diagnostic.weakAreas.map((area) => (
                <li
                  key={area.lessonId}
                  className="flex flex-wrap items-center justify-between gap-2 rounded border border-theme-border bg-theme-base p-2 text-theme-text"
                >
                  <span>
                    {area.lessonTitle} ({area.missCount} miss{area.missCount === 1 ? '' : 'es'})
                  </span>
                  <Link
                    to={`/stage/${stage.id}/lesson/${area.lessonId}`}
                    className="rounded border border-amber-500/40 px-2 py-1 text-[11px] text-amber-200 hover:bg-amber-500/10"
                  >
                    Review lesson
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-theme-secondary">
              Most misses were cross-cutting. Review stage lessons and retake when ready.
            </p>
          )}
        </Card>
      ) : null}

      <div className="flex items-center justify-between">
        <Link to={`/stage/${stage.id}`} className="rounded border border-theme-border px-3 py-2 text-xs text-theme-text">
          Back to Stage
        </Link>
        <button
          type="button"
          onClick={() => navigate('/')}
          className="rounded bg-theme-raised px-3 py-2 text-xs font-semibold text-theme-text"
        >
          Return Home
        </button>
      </div>
    </div>
  );
};
