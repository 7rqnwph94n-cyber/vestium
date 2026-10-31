import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../../components/Card';
import { useTheme } from '../../lib/training-core/ThemeContext';
import { DEFAULT_THEME_ID } from '../../lib/training-core/registry';
import { useProgress } from '../progress/ProgressContext';
import { getDueReviewItems, getUpcomingReviewItems } from '../progress/review';

const answerDisplay = (answer: string | boolean) => (typeof answer === 'boolean' ? (answer ? 'True' : 'False') : answer);

export const AdaptiveReviewPage = () => {
  const { currentTheme, currentThemeId } = useTheme();
  const { state, submitAdaptiveReviewResponse } = useProgress();
  const labels = currentTheme.labels ?? {};
  const dueItems = useMemo(
    () => getDueReviewItems(state).filter((item) => (item.themeId ?? DEFAULT_THEME_ID) === currentThemeId),
    [state, currentThemeId]
  );
  const upcomingItems = useMemo(
    () => getUpcomingReviewItems(state).filter((item) => (item.themeId ?? DEFAULT_THEME_ID) === currentThemeId),
    [state, currentThemeId]
  );
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string | boolean | null>(null);
  const [revealed, setRevealed] = useState(false);

  const item = dueItems[index] ?? null;
  const isCorrect = item ? selected === item.answer : false;

  const advance = () => {
    setSelected(null);
    setRevealed(false);
    setIndex((prev) => {
      const remaining = Math.max(0, dueItems.length - 1);
      return remaining === 0 ? 0 : Math.min(prev, remaining - 1);
    });
  };

  return (
    <div className="space-y-4">
      <Card title={labels.adaptiveReviewPageTitle ?? labels.reviewTitle ?? 'Adaptive Review'}>
        <p className="text-sm text-theme-secondary">
          This is your refresh queue. Questions you miss come back sooner, and questions you keep getting right come back less often.
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-amber-200">
            Ready now: {dueItems.length}
          </span>
          <span className="rounded border border-theme-border px-2 py-1 text-theme-secondary">
            Coming up: {upcomingItems.length}
          </span>
        </div>
      </Card>

      {!item ? (
        <Card title={labels.adaptiveReviewNoDueTitle ?? 'No Practice Items Ready'}>
          <p className="text-sm text-theme-secondary">
            Nothing is ready right now. As you complete lessons and tests, this queue updates automatically.
          </p>
          {upcomingItems[0] ? (
            <p className="mt-2 text-xs text-theme-secondary">
              Next due: {new Date(upcomingItems[0].dueAt).toLocaleString()} ({upcomingItems[0].sourceTitle})
            </p>
          ) : null}
          <div className="mt-3">
            <Link to="/" className="rounded border border-theme-border px-3 py-2 text-xs text-theme-text">
              Back to Dashboard
            </Link>
          </div>
        </Card>
      ) : (
        <Card title={`Review Card ${index + 1} of ${dueItems.length}`}>
          <div className="space-y-3">
            <div className="rounded border border-theme-border bg-theme-base p-3">
              <p className="text-xs text-theme-secondary">
                Source: Stage {item.stageId} • {item.sourceTitle}
                {item.lessonId ? ` • ${item.lessonId}` : ''}
              </p>
              <p className="mt-2 text-sm text-theme-text">{item.prompt}</p>
            </div>

            {item.type === 'mcq' ? (
              <div className="space-y-2">
                {(item.options ?? []).map((opt) => (
                  <label
                    key={opt}
                    className="flex cursor-pointer items-center gap-2 rounded border border-theme-border bg-theme-base p-2 text-sm text-theme-text"
                  >
                    <input
                      type="radio"
                      name={item.key}
                      checked={selected === opt}
                      onChange={() => setSelected(opt)}
                    />
                    {opt}
                  </label>
                ))}
              </div>
            ) : (
              <div className="flex gap-3">
                {[true, false].map((opt) => (
                  <label
                    key={String(opt)}
                    className="flex cursor-pointer items-center gap-2 rounded border border-theme-border bg-theme-base px-3 py-2 text-sm text-theme-text"
                  >
                    <input
                      type="radio"
                      name={item.key}
                      checked={selected === opt}
                      onChange={() => setSelected(opt)}
                    />
                    {opt ? 'True' : 'False'}
                  </label>
                ))}
              </div>
            )}

            {!revealed ? (
              <button
                type="button"
                disabled={selected === null}
                onClick={() => setRevealed(true)}
                className="rounded bg-amber-500 px-3 py-2 text-xs font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Check Answer
              </button>
            ) : (
              <div className="space-y-3">
                <div className="rounded border border-theme-border bg-theme-panel/60 p-3">
                  <p className={`text-xs font-semibold ${isCorrect ? 'text-emerald-300' : 'text-rose-300'}`}>
                    {isCorrect ? 'Correct' : `Incorrect. Correct answer: ${answerDisplay(item.answer)}`}
                  </p>
                  <p className="mt-1 text-xs text-theme-secondary">{item.explanation}</p>
                  <p className="mt-2 text-[11px] text-theme-muted">
                    Next revisit in: {item.intervalDays} day(s) • Successful recalls: {item.repetitions}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      submitAdaptiveReviewResponse(item.key, false);
                      advance();
                    }}
                    className="rounded border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-200 hover:bg-rose-500/20"
                  >
                    Need more practice
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      submitAdaptiveReviewResponse(item.key, true);
                      advance();
                    }}
                    className="rounded border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/20"
                  >
                    Got it
                  </button>
                </div>
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
};
