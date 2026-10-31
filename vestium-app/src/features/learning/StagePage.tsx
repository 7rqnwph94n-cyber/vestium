import { Link, Navigate, useParams } from 'react-router-dom';
import { Card } from '../../components/Card';
import { CompletionBadge } from '../../components/CompletionBadge';
import { ProgressBar } from '../../components/ProgressBar';
import { getRequiredTrainingMissionIdsForLessons, getTrainingMissionById } from '../../lib/training-core/simulator';
import { resolveToolAvailability } from '../../lib/training-core/tooling';
import { useTheme } from '../../lib/training-core/ThemeContext';
import { useProgress } from '../progress/ProgressContext';
import {
  canAttemptStageTest,
  isStageUnlocked,
  stageCompletionBreakdown
} from '../progress/gating';
import { RolePlaySimulatorPanel } from '../simulator/RolePlaySimulatorPanel';

export const StagePage = () => {
  const { currentTheme, currentThemeId } = useTheme();
  const params = useParams();
  const stageId = Number(params.stageId);
  const curriculum = currentTheme.curriculum;
  const stage = curriculum.find((s) => s.id === stageId);
  const { state } = useProgress();
  const simulatorLabel = currentTheme.terms?.simulatorLabel ?? 'Simulator';
  const toolAvailability = resolveToolAvailability(currentTheme);
  const simulatorEnabled = toolAvailability.simulator;

  if (!stage) return <Navigate to="/" replace />;
  if (!isStageUnlocked(state, stage.id)) return <Navigate to="/" replace />;

  const breakdown = stageCompletionBreakdown(state, stage);
  const testReady = canAttemptStageTest(state, stage);
  const requiredMissionIds = getRequiredTrainingMissionIdsForLessons(
    stage.lessons.map((lesson) => lesson.id),
    currentThemeId
  );
  const unmetMissionIds = requiredMissionIds.filter((missionId) => !state.simulatorMissionsCompleted[missionId]);
  const unmetLessons = stage.lessons.filter((lesson) => !state.lessonsCompleted[lesson.id]);

  const progressLabel = breakdown.totalMissions > 0
    ? `Lessons ${breakdown.completedLessons}/${breakdown.totalLessons} · Missions ${breakdown.completedMissions}/${breakdown.totalMissions} · Test ${breakdown.testPassed ? '✓' : '○'}`
    : `Lessons ${breakdown.completedLessons}/${breakdown.totalLessons} · Test ${breakdown.testPassed ? '✓' : '○'}`;

  return (
    <div className="space-y-4">
      <Card title={`Stage ${stage.id}: ${stage.title}`}>
        <p className="text-sm text-theme-secondary">{stage.description}</p>
        <div className="mt-3 flex items-center justify-between text-xs">
          <span>{breakdown.percent}% complete</span>
          <span className="text-amber-300">{progressLabel}</span>
        </div>
        <ProgressBar value={breakdown.percent} />
        <div className="mt-3 grid gap-2 sm:grid-cols-3 text-xs">
          <div className="rounded border border-theme-border bg-theme-base p-2">
            <p className="text-theme-muted">Lessons</p>
            <p className="font-semibold text-theme-text">
              {breakdown.completedLessons}/{breakdown.totalLessons}
            </p>
          </div>
          <div className="rounded border border-theme-border bg-theme-base p-2">
            <p className="text-theme-muted">Required Missions</p>
            <p className={`font-semibold ${breakdown.totalMissions > 0 ? 'text-amber-300' : 'text-theme-secondary'}`}>
              {breakdown.totalMissions > 0
                ? `${breakdown.completedMissions}/${breakdown.totalMissions}`
                : 'None'}
            </p>
          </div>
          <div className="rounded border border-theme-border bg-theme-base p-2">
            <p className="text-theme-muted">Stage Test</p>
            <p className={`font-semibold ${breakdown.testPassed ? 'text-emerald-300' : 'text-theme-secondary'}`}>
              {breakdown.testPassed ? 'Passed' : 'Not passed'}
            </p>
          </div>
        </div>
      </Card>

      <Card title="Lessons">
        <div className="space-y-2">
          {stage.lessons.map((lesson) => (
            <div key={lesson.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-theme-border p-3">
              <div>
                <p className="text-sm font-medium text-theme-text">
                  {lesson.title}
                  {lesson.readingMinutes ? (
                    <span className="ml-2 text-xs font-normal text-theme-secondary">~{lesson.readingMinutes} min</span>
                  ) : null}
                </p>
                <p className="text-xs text-theme-secondary">{lesson.objective}</p>
              </div>
              <div className="flex items-center gap-2">
                <CompletionBadge complete={Boolean(state.lessonsCompleted[lesson.id])} />
                <Link to={`/stage/${stage.id}/lesson/${lesson.id}`} className="rounded bg-theme-raised px-3 py-2 text-xs font-semibold text-theme-text hover:bg-theme-raised">
                  Open Lesson
                </Link>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Stage Test Gate">
        <p className="text-sm text-theme-secondary">
          Pass with at least 85% to unlock Stage {Math.min(curriculum.length, stage.id + 1)}.
        </p>
        <p className="mt-2 text-xs text-theme-secondary">
          Eligibility: all lessons in this stage must be complete before taking the test.
          {requiredMissionIds.length > 0 ? ` Required ${simulatorLabel.toLowerCase()} missions must also be completed.` : ''}
        </p>

        {/* Explicit progress breakdown */}
        <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
          <div className={`rounded border p-2 text-center ${breakdown.completedLessons === breakdown.totalLessons ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border-theme-border bg-theme-base text-theme-secondary'}`}>
            <p className="font-semibold">Lessons</p>
            <p>{breakdown.completedLessons}/{breakdown.totalLessons}</p>
          </div>
          {breakdown.totalMissions > 0 ? (
            <div className={`rounded border p-2 text-center ${breakdown.completedMissions === breakdown.totalMissions ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border-amber-500/30 bg-amber-500/5 text-amber-300'}`}>
              <p className="font-semibold">Role-Play Missions</p>
              <p>{breakdown.completedMissions}/{breakdown.totalMissions}</p>
            </div>
          ) : (
            <div className="rounded border border-theme-border bg-theme-base p-2 text-center text-theme-muted">
              <p className="font-semibold">Missions</p>
              <p>None required</p>
            </div>
          )}
          <div className={`rounded border p-2 text-center ${breakdown.testPassed ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border-theme-border bg-theme-base text-theme-secondary'}`}>
            <p className="font-semibold">Stage Test</p>
            <p>{breakdown.testPassed ? 'Passed' : 'Not yet'}</p>
          </div>
        </div>

        {!testReady ? (
          <div className="mt-3 rounded border border-rose-500/30 bg-rose-900/10 p-3">
            <p className="text-xs font-semibold text-rose-200">What&apos;s blocking me?</p>
            <div className="mt-2 space-y-1 text-xs text-theme-secondary">
              {unmetLessons.length > 0 ? (
                <p>
                  <span className="font-semibold text-rose-300">Lessons incomplete:</span>{' '}
                  {unmetLessons.length} of {stage.lessons.length} remaining
                </p>
              ) : (
                <p className="text-emerald-400">All lessons complete.</p>
              )}
              {unmetMissionIds.length > 0 ? (
                <p>
                  <span className="font-semibold text-amber-300">Simulator missions pending:</span>{' '}
                  {unmetMissionIds.length} of {requiredMissionIds.length} remaining
                </p>
              ) : requiredMissionIds.length > 0 ? (
                <p className="text-emerald-400">All required simulator missions complete.</p>
              ) : null}
              {!breakdown.testPassed && unmetLessons.length === 0 && unmetMissionIds.length === 0 ? (
                <p className="text-amber-200">Stage test not yet attempted — ready to go!</p>
              ) : null}
            </div>
            {unmetLessons.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {unmetLessons.map((lesson) => (
                  <Link
                    key={lesson.id}
                    to={`/stage/${stage.id}/lesson/${lesson.id}`}
                    className="rounded border border-theme-border px-2 py-1 text-xs text-theme-text hover:border-theme-border"
                  >
                    Lesson: {lesson.title}
                  </Link>
                ))}
              </div>
            ) : null}
            {unmetMissionIds.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {unmetMissionIds.map((missionId) => (
                  <Link
                    key={missionId}
                    to={`/stage/${stage.id}?mission=${encodeURIComponent(missionId)}`}
                  className="rounded border border-amber-500/40 px-2 py-1 text-xs text-amber-200 hover:bg-amber-500/10"
                  >
                    Mission: {getTrainingMissionById(missionId, currentThemeId)?.title ?? missionId}
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        {requiredMissionIds.length > 0 ? (
          <div className="mt-3 space-y-2">
            {requiredMissionIds.map((missionId) => {
              const mission = getTrainingMissionById(missionId, currentThemeId);
              const done = Boolean(state.simulatorMissionsCompleted[missionId]);
              return (
                <p
                  key={missionId}
                  className={`rounded border px-2 py-2 text-xs ${
                    done
                      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                      : 'border-theme-border bg-theme-base text-theme-secondary'
                  }`}
                >
                  {done ? 'Complete' : 'Pending'}: {mission?.title ?? missionId}
                </p>
              );
            })}
          </div>
        ) : null}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {testReady ? (
            <Link to={`/stage/${stage.id}/test`} className="rounded bg-amber-500 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400">
              Take Stage Test
            </Link>
          ) : (
            <span className="rounded border border-theme-border px-3 py-2 text-xs text-theme-secondary">
              {unmetMissionIds.length > 0
                ? 'Complete required simulator missions to unlock test'
                : unmetLessons.length > 0
                  ? 'Complete remaining lessons to unlock test'
                  : 'Complete all requirements above to unlock test'}
            </span>
          )}
          {state.stageTestsPassed[stage.id] ? <span className="text-xs text-emerald-300">Passed ({state.stageTestScores[stage.id]}%)</span> : null}
          {state.stageTestsPassed[stage.id] ? (
            <Link
              to={`/stage/${stage.id}/certificate`}
              className="rounded border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/20"
            >
              Stage Completion Certificate
            </Link>
          ) : null}
        </div>
      </Card>

      {!simulatorEnabled ? (
        <Card title={`${simulatorLabel} Unavailable`}>
          <p className="text-xs text-theme-secondary">
            This module does not currently use simulator tooling for this stage. Continue lesson and assessment flow.
          </p>
        </Card>
      ) : (
        <Card title={`${simulatorLabel} — Stage Practice`} className="space-y-3">
          <p className="text-xs text-theme-secondary">
            Run branching role-play scenarios to practice the stage skills in realistic customer conversations. Scenario completion counts toward stage mission requirements.
          </p>
          <div className="grid gap-2 sm:grid-cols-3 text-xs">
            <div className="rounded border border-theme-border bg-theme-base p-2">
              <p className="font-semibold text-sky-300">Scenario</p>
              <p className="mt-1 text-theme-secondary">Pick the current customer situation.</p>
            </div>
            <div className="rounded border border-theme-border bg-theme-base p-2">
              <p className="font-semibold text-emerald-300">Response Choice</p>
              <p className="mt-1 text-theme-secondary">Select the rep response you would use next.</p>
            </div>
            <div className="rounded border border-theme-border bg-theme-base p-2">
              <p className="font-semibold text-amber-300">Coaching Feedback</p>
              <p className="mt-1 text-theme-secondary">Review outcome, score, and coaching notes immediately.</p>
            </div>
          </div>
          <RolePlaySimulatorPanel stageId={stage.id} />
        </Card>
      )}
    </div>
  );
};
