import { Link } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { Card } from '../../components/Card';
import { ProgressBar } from '../../components/ProgressBar';
import { useTheme } from '../../lib/training-core/ThemeContext';
import { DEFAULT_THEME_ID } from '../../lib/training-core/registry';
import { resolveToolAvailability } from '../../lib/training-core/tooling';
import { isStageUnlocked, stageCompletionBreakdown } from '../progress/gating';
import { useProgress } from '../progress/ProgressContext';
import { getDueReviewItems } from '../progress/review';
import { useNextStep } from '../progress/useNextStep';
import { DASHBOARD_ONBOARDING_SEEN_KEY, LAST_ACTIVE_LESSON_KEY } from '../../utils/constants';

export const DashboardPage = () => {
  const { currentTheme } = useTheme();
  const curriculum = currentTheme.curriculum;
  const { state, resetProgress } = useProgress();
  const dueReviewCount = getDueReviewItems(state).filter((item) => (item.themeId ?? DEFAULT_THEME_ID) === currentTheme.id).length;
  // Guard: training is only complete when ALL stages in the CURRENT curriculum are explicitly passed.
  // Bare integer stageId keys (1, 2, …) are shared across modules, so stale progress from a
  // different module can make it look like this one is done. Check against curriculum explicitly.
  const isTrainingComplete =
    curriculum.length > 0 &&
    curriculum.every((stage) => Boolean(state.stageTestsPassed[stage.id]));
  const labels = currentTheme.labels ?? {};
  const simulatorLabel = currentTheme.terms?.simulatorLabel ?? 'Simulator';
  const hasSiemensTrack = Boolean(currentTheme.flags?.hasSiemensTrack);
  const toolAvailability = resolveToolAvailability(currentTheme);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const onboardingSteps = useMemo(
    () => [
      {
        title: 'How progression works',
        body: `Work stage by stage. Finish lessons, complete required ${simulatorLabel.toLowerCase()} missions, then pass the stage test to unlock the next stage.`
      },
      {
        title: 'Use practice before scoring',
        body: 'Each lesson gives concept learning, a practical activity, and a quiz. Practice mode reveals answers immediately; completion check is the scored gate.'
      },
      {
        title: 'Follow the top recommendation',
        body: 'Use the Recommended Next Step card at the top of this page. It is the fastest way to stay in sequence without hunting through menus.'
      },
      {
        title: 'Keep retention active',
        body: `Use ${labels.reviewTitle ?? 'Adaptive Review'} regularly. It automatically resurfaces weak questions so knowledge stays stable between sessions.`
      }
    ],
    [labels.reviewTitle, simulatorLabel]
  );

  useEffect(() => {
    try {
      const seen = window.localStorage.getItem(DASHBOARD_ONBOARDING_SEEN_KEY);
      if (!seen) setShowOnboarding(true);
    } catch {
      // Ignore storage access issues.
    }
  }, []);

  const completeOnboarding = () => {
    setShowOnboarding(false);
    setOnboardingStep(0);
    try {
      window.localStorage.setItem(DASHBOARD_ONBOARDING_SEEN_KEY, '1');
    } catch {
      // Ignore storage write issues.
    }
  };

  // Determine recommended next step using shared hook
  const { nextStep: stageNextStep, recommendedStageId } = useNextStep(
    state, curriculum, currentTheme.id, simulatorLabel
  );

  const nextStep =
    stageNextStep ??
    (toolAvailability.review && dueReviewCount > 0
      ? {
          label: `${labels.reviewTitle ?? 'Adaptive Review'}: ${dueReviewCount} quick practice item${dueReviewCount > 1 ? 's' : ''} ready`,
          to: '/review',
          helper: 'Quick practice keeps weak topics fresh and improves long-term retention.'
        }
      : null);
  let resumeLesson:
    | { path: string; lessonTitle: string; stageId: number; themeId: string }
    | null = null;
  try {
    const raw = localStorage.getItem(LAST_ACTIVE_LESSON_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as {
        path?: string;
        lessonTitle?: string;
        stageId?: number;
        themeId?: string;
      };
      if (
        parsed.path &&
        parsed.lessonTitle &&
        typeof parsed.stageId === 'number' &&
        parsed.themeId === currentTheme.id
      ) {
        resumeLesson = {
          path: parsed.path,
          lessonTitle: parsed.lessonTitle,
          stageId: parsed.stageId,
          themeId: parsed.themeId
        };
      }
    }
  } catch {
    resumeLesson = null;
  }

  return (
    <div className="space-y-5">
      {showOnboarding ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-theme-base px-4">
          <div className="w-full max-w-xl rounded-lg border border-theme-border bg-theme-panel p-5 shadow-xl shadow-theme">
            <p className="text-xs uppercase tracking-wide text-theme-secondary">
              Quick Start ({onboardingStep + 1}/4)
            </p>
            <h2 className="mt-2 text-lg font-semibold text-theme-text">
              {onboardingSteps[onboardingStep].title}
            </h2>
            <p className="mt-2 text-sm text-theme-secondary">{onboardingSteps[onboardingStep].body}</p>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={completeOnboarding}
                className="text-xs text-theme-secondary underline underline-offset-2 hover:text-theme-text"
              >
                Skip
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={onboardingStep === 0}
                  onClick={() => setOnboardingStep((step) => Math.max(0, step - 1))}
                  className="rounded border border-theme-border px-3 py-2 text-xs text-theme-text disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (onboardingStep >= onboardingSteps.length - 1) {
                      completeOnboarding();
                      return;
                    }
                    setOnboardingStep((step) => Math.min(onboardingSteps.length - 1, step + 1));
                  }}
                  className="rounded bg-amber-500 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400"
                >
                  {onboardingStep >= onboardingSteps.length - 1 ? 'Finish' : 'Next'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Recommended next step — primary CTA */}
      {nextStep ? (
        <Card
          title={labels.dashboardRecommendedNextStepTitle ?? 'Recommended Next Step'}
          className="border-amber-500/40 bg-amber-500/10"
        >
          <p className="text-base font-semibold text-theme-text">{nextStep.label}</p>
          {nextStep.helper ? <p className="mt-1 text-xs text-theme-secondary">{nextStep.helper}</p> : null}
          {resumeLesson ? (
            <p className="mt-2 text-xs text-amber-200">
              Welcome back — continue "{resumeLesson.lessonTitle}"
            </p>
          ) : null}
          <div className="mt-3">
            <Link
              to={nextStep.to}
              className="block w-full rounded bg-amber-400 px-4 py-3 text-center text-sm font-bold text-slate-950 hover:bg-amber-300"
            >
              Continue Now
            </Link>
          </div>
          {resumeLesson ? (
            <div className="mt-2">
              <Link
                to={resumeLesson.path}
                className="block w-full rounded border border-amber-500/40 px-4 py-2 text-center text-xs font-semibold text-amber-200 hover:bg-amber-500/10"
              >
                Resume Previous Lesson: {resumeLesson.lessonTitle}
              </Link>
            </div>
          ) : null}
          <div className="mt-2 text-center">
            <Link
              to="/learn"
              className="text-xs text-theme-secondary underline decoration-theme-border underline-offset-2 hover:text-theme-text"
            >
              Switch training module
            </Link>
          </div>
        </Card>
      ) : isTrainingComplete ? (
        <Card title={labels.dashboardTrainingCompleteTitle ?? 'Training Complete'} className="border-emerald-500/40 bg-emerald-500/10">
          <p className="text-sm text-emerald-300">
            All stages passed. Use {labels.reviewTitle ?? 'Adaptive Review'} and {labels.dashboardExtensionsTitle ?? 'Labs & Extensions'} below for continued practice.
          </p>
          {/^[0-9a-f-]{36}$/.test(currentTheme.id) ? (
            <div className="mt-3">
              <Link
                to={`/learn/${currentTheme.id}/complete`}
                className="block w-full rounded bg-emerald-500 px-4 py-3 text-center text-sm font-bold text-slate-950 hover:bg-emerald-400"
              >
                Complete Module & Issue Certificate
              </Link>
            </div>
          ) : null}
        </Card>
      ) : curriculum.length > 0 ? (
        <Card
          title={labels.dashboardRecommendedNextStepTitle ?? 'Recommended Next Step'}
          className="border-amber-500/40 bg-amber-500/10"
        >
          <p className="text-base font-semibold text-theme-text">Begin Stage 1</p>
          <p className="mt-1 text-xs text-theme-secondary">Start the first lesson to begin your training.</p>
          <div className="mt-3">
            <Link
              to={`/stage/1/lesson/${curriculum[0].lessons[0]?.id ?? ''}`}
              className="block w-full rounded bg-amber-400 px-4 py-3 text-center text-sm font-bold text-slate-950 hover:bg-amber-300"
            >
              Start Now
            </Link>
          </div>
        </Card>
      ) : null}

      <Card title={labels.dashboardPageTitle ?? 'Training Dashboard'}>
        <p className="mb-2 text-xs text-theme-muted">
          {currentTheme.icon ? `${currentTheme.icon} ` : ''}{currentTheme.title}
        </p>
        <p className="text-sm text-theme-secondary">
          Complete each stage in order. Lesson quizzes require 80% and stage tests require 85%
          with all stage lessons and required {simulatorLabel.toLowerCase()} missions completed.
        </p>

        {/* Placement assessment */}
        <div className="mt-3 rounded border border-amber-500/30 bg-amber-500/10 p-3">
          <p className="text-xs font-semibold text-amber-200">Experienced tech? Start with placement.</p>
          <p className="mt-1 text-xs text-theme-secondary">
            Use the placement assessment to get a recommended entry stage and unlock that stage
            without replaying basics you already know.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Link
              to="/placement"
              className="rounded bg-amber-500 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400"
            >
              Take Placement Assessment
            </Link>
            {state.placementAssessmentCompleted ? (
              <span className="text-xs text-theme-secondary">
                Last result: {state.placementScore}% {'->'} Stage {state.placementRecommendedStage}
              </span>
            ) : null}
          </div>
        </div>

        {/* Adaptive Review — visible but not buried */}
        <div className="mt-3 rounded border border-amber-500/20 bg-amber-500/5 p-3">
          <p className="text-xs font-semibold text-amber-200">
            {(labels.reviewTitle ?? 'Adaptive Review')} {dueReviewCount > 0 ? `— ${dueReviewCount} quick practice item${dueReviewCount > 1 ? 's' : ''} ready` : '— no quick practice items ready'}
          </p>
          <p className="mt-1 text-xs text-theme-secondary">
            Spaced-repetition review of questions you answered incorrectly in previous quizzes.
            Keeps knowledge fresh and builds long-term retention.
          </p>
          <div className="mt-2">
            <Link
              to="/review"
              className="rounded border border-amber-500/40 px-3 py-1 text-xs text-amber-200 hover:bg-amber-500/10"
            >
              Open {labels.reviewTitle ?? 'Adaptive Review'}
            </Link>
          </div>
        </div>

        {/* Stage badge strip */}
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          {curriculum.map((stage) => (
            <span
              key={stage.id}
              className={`rounded border px-2 py-1 ${
                state.badges.includes(stage.id)
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                  : 'border-theme-border text-theme-muted'
              }`}
            >
              S{stage.id} {state.badges.includes(stage.id) ? 'Badge ✓' : '—'}
            </span>
          ))}
        </div>
      </Card>

      {/* Stage cards grid */}
      <div className="grid gap-4 md:grid-cols-2">
        {curriculum.map((stage) => {
          const unlocked = isStageUnlocked(state, stage.id);
          const done = Boolean(state.stageTestsPassed[stage.id]);
          const bd = stageCompletionBreakdown(state, stage);
          const status = done ? 'complete' : unlocked ? 'in-progress' : 'locked';
          const isRecommended = stage.id === recommendedStageId;

          return (
            <Card key={stage.id} title={`Stage ${stage.id}: ${stage.title}`}>
              <div className="mb-2 flex items-center justify-between text-xs">
                <span className={`uppercase tracking-wide ${isRecommended ? 'text-amber-300 font-semibold' : 'text-theme-secondary'}`}>
                  {isRecommended ? 'Current ▶' : `Status: ${status}`}
                </span>
                <span className="text-amber-300">{bd.percent}%</span>
              </div>
              <ProgressBar value={bd.percent} />
              {bd.totalMissions > 0 ? (
                <p className="mt-1 text-xs text-theme-muted">
                  Lessons {bd.completedLessons}/{bd.totalLessons} · Missions {bd.completedMissions}/{bd.totalMissions} · Test {bd.testPassed ? '✓' : '○'}
                </p>
              ) : (
                <p className="mt-1 text-xs text-theme-muted">
                  Lessons {bd.completedLessons}/{bd.totalLessons} · Test {bd.testPassed ? '✓' : '○'}
                </p>
              )}
              <div className="mt-3">
                {unlocked ? (
                  <Link
                    className="block w-full rounded bg-amber-500 px-3 py-2 text-center text-xs font-semibold text-slate-950 hover:bg-amber-400"
                    to={`/stage/${stage.id}`}
                  >
                    Open Stage
                  </Link>
                ) : (
                  <span className="inline-flex w-full justify-center rounded border border-theme-border px-3 py-2 text-xs text-theme-secondary">
                    Locked — pass Stage {stage.id - 1} test
                  </span>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      <Card title={labels.dashboardExtensionsTitle ?? 'Labs & Extensions'}>
        <p className="mb-3 text-xs text-theme-secondary">
          Optional and advanced tools. Useful for extra practice and specialization, but not the main beginner progression path.
        </p>
        <div className="flex flex-wrap gap-2 text-xs">
          {toolAvailability.builder ? (
            <Link
              to="/builder"
              className="rounded border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-sky-200 hover:bg-sky-500/20"
            >
              {labels.ladderBuilderTitle ?? 'Ladder Builder'}
            </Link>
          ) : null}
          {hasSiemensTrack ? (
            <Link
              to="/siemens-track"
              className="rounded border border-indigo-500/40 bg-indigo-500/10 px-3 py-2 text-indigo-200 hover:bg-indigo-500/20"
            >
              {labels.siemensTrackBreadcrumbTitle ?? 'Siemens TIA Track'}
            </Link>
          ) : null}
          {toolAvailability.faultCampaign ? (
            <Link
              to="/fault-campaign"
              className="rounded border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-rose-200 hover:bg-rose-500/20"
            >
              {labels.faultCampaignTitle ?? 'Fault Campaign'}
            </Link>
          ) : null}
          {toolAvailability.pidIntro ? (
            <Link
              to="/pid-intro"
              className="rounded border border-teal-500/40 bg-teal-500/10 px-3 py-2 text-teal-200 hover:bg-teal-500/20"
            >
              {labels.pidIntroTitle ?? 'PID Intro'}
            </Link>
          ) : null}
          {toolAvailability.capstone ? (
            <Link
              to="/capstone"
              className="rounded border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-emerald-200 hover:bg-emerald-500/20"
            >
              {labels.capstoneTitle ?? 'Capstone Challenge'}
            </Link>
          ) : null}
          {(currentTheme.missions?.length ?? 0) > 0 ? (
            <Link
              to="/duty-holder"
              className="rounded border border-violet-500/40 bg-violet-500/10 px-3 py-2 text-violet-200 hover:bg-violet-500/20"
            >
              Duty Holder Assessment
            </Link>
          ) : null}
          <Link
            to="/field-reference"
            className="rounded border border-theme-border px-3 py-2 text-theme-secondary hover:border-theme-border-subtle"
          >
            {labels.fieldReferenceTitle ?? 'Field Reference'}
          </Link>
          <Link
            to="/sources"
            className="rounded border border-theme-border px-3 py-2 text-theme-secondary hover:border-theme-border-subtle"
          >
            {labels.sourcesTitle ?? 'Legislation & References'}
          </Link>
        </div>
      </Card>

      <Card title="Settings">
        {state.faultCampaign ? (
          <div className="mb-3 rounded border border-theme-border bg-theme-base p-3 text-xs text-theme-secondary">
            <p className="font-semibold text-theme-text">Fault Campaign Progress</p>
            <p className="mt-1">Runs completed: {state.faultCampaign.completedRuns}</p>
            <p>Best score: {state.faultCampaign.bestScore ?? '—'}</p>
            <p>Best correct count: {state.faultCampaign.bestCorrectCount ?? '—'}</p>
            {state.achievementFlags?.fault_finder_campaign ? (
              <p className="mt-1 text-emerald-300">Achievement: Fault-Finder badge earned</p>
            ) : null}
          </div>
        ) : null}
        <button
          type="button"
          onClick={() => {
            if (window.confirm('Reset all progress, XP, and badges?')) {
              resetProgress();
            }
          }}
          className="rounded border border-rose-600/40 bg-rose-800/20 px-3 py-2 text-xs font-semibold text-rose-200 hover:bg-rose-700/30"
        >
          Reset Progress
        </button>
      </Card>
    </div>
  );
};
