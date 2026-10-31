import { Link, useNavigate } from 'react-router-dom';
import { Card } from '../../components/Card';
import { Quiz } from '../../components/Quiz';
import { useTheme } from '../../lib/training-core/ThemeContext';
import { useProgress } from '../progress/ProgressContext';

export const PlacementAssessmentPage = () => {
  const { currentTheme } = useTheme();
  const navigate = useNavigate();
  const { state, submitPlacementAssessment } = useProgress();
  const placementConfig = currentTheme.placementAssessment;
  const placementQuestions = placementConfig?.questions ?? [];
  const recommendStage = placementConfig?.recommendStage ?? ((score: number) => (score >= 87 ? 3 : score >= 67 ? 2 : 1));

  return (
    <div className="space-y-4">
      <Card title={placementConfig?.title ?? 'Placement Assessment'}>
        <p className="text-sm text-theme-secondary">
          {placementConfig?.introText ??
            'Entry assessment recommends a starting stage and can unlock that entry point, but advanced stages still require lesson and simulator mission completion before stage tests.'}
        </p>
        {state.placementAssessmentCompleted ? (
          <p className="mt-2 text-xs text-amber-300">
            {placementConfig?.completedResultLabel ?? 'Previous result'}: {state.placementScore}% {'->'} Recommended Stage {state.placementRecommendedStage}
          </p>
        ) : null}
      </Card>

      <Quiz
        title={placementConfig?.quizTitle ?? 'Placement Quiz'}
        questions={placementQuestions}
        passScore={0}
        onSubmit={(score) => {
          const recommendedStage = recommendStage(score);
          submitPlacementAssessment(score, recommendedStage);
        }}
      />

      {state.placementAssessmentCompleted ? (
        <Card title={placementConfig?.recommendedStartTitle ?? 'Recommended Start'}>
          <p className="text-sm text-theme-secondary">
            Recommended entry point: <span className="text-amber-300">Stage {state.placementRecommendedStage}</span>
          </p>
          <p className="mt-2 text-xs text-theme-secondary">
            {placementConfig?.recommendedStartHint ??
              'If you skip ahead, use the simulator missions early to validate practical skills before attempting stage tests.'}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              to={`/stage/${state.placementRecommendedStage ?? 1}`}
              className="rounded bg-amber-500 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400"
            >
              Open Recommended Stage
            </Link>
            <button
              type="button"
              onClick={() => navigate('/')}
              className="rounded border border-theme-border px-3 py-2 text-xs text-theme-text"
            >
              Back to Dashboard
            </button>
          </div>
        </Card>
      ) : null}
    </div>
  );
};
