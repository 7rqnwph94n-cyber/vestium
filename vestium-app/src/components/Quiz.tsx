import { type Dispatch, type ReactNode, type SetStateAction, useMemo, useRef, useState } from 'react';
import { QuizQuestion } from '../lib/training-core/types';
import { useTheme } from '../lib/training-core/ThemeContext';
import { scoreQuiz, shuffledMcqOptions } from '../utils/quiz';
import { Card } from './Card';

/**
 * Quiz component supporting two assessment modes:
 *
 * "practice" mode (feedbackMode="immediate"):
 *   - Answers reveal correct/incorrect immediately on selection.
 *   - Learners can see right answers before submitting — good for learning but
 *     NOT eligible for completion credit when allowPracticeMode=true.
 *   - Shows "Practice Mode" label so learners know this doesn't count.
 *
 * "completion" mode (feedbackMode="deferred", triggered by onRequestCompletion):
 *   - No answer reveal until after final submit.
 *   - Score is computed and compared to passScore.
 *   - If passed, calls onPass for lesson completion credit.
 *   - Warns if questions are unanswered before submit.
 */
export const Quiz = ({
  questions,
  passScore,
  title,
  onPass,
  onSubmit,
  feedbackMode = 'deferred',
  allowPracticeMode = false,
  onDetailedSubmit,
  completionSuccessContent
}: {
  questions: QuizQuestion[];
  passScore: number;
  title: string;
  onPass?: (score: number) => void;
  onSubmit?: (score: number, passed: boolean) => void;
  /**
   * 'immediate' — reveal correct answer on selection (learning mode).
   * 'deferred'  — reveal only after submit (assessment mode).
   */
  feedbackMode?: 'deferred' | 'immediate';
  /**
   * When true, adds a separate "Practice Mode" section with immediate feedback,
   * and requires a separate "Completion Check" attempt for credit.
   * feedbackMode is ignored when this is true — practice always shows immediate
   * feedback and completion always uses deferred.
   */
  allowPracticeMode?: boolean;
  onDetailedSubmit?: (payload: {
    score: number;
    passed: boolean;
    answers: Record<string, string | boolean>;
    questions: QuizQuestion[];
  }) => void;
  completionSuccessContent?: ReactNode;
}) => {
  const { currentTheme } = useTheme();
  const labels = currentTheme.labels ?? {};
  // Practice attempt state (only used when allowPracticeMode=true)
  const [practiceAnswers, setPracticeAnswers] = useState<Record<string, string | boolean>>({});
  const [practiceSubmitted, setPracticeSubmitted] = useState(false);

  // Scored completion attempt state
  const [completionMode, setCompletionMode] = useState(!allowPracticeMode);
  const [answers, setAnswers] = useState<Record<string, string | boolean>>({});
  const [submitted, setSubmitted] = useState(false);
  const [showUnansweredWarning, setShowUnansweredWarning] = useState(false);
  const [reviewFilter, setReviewFilter] = useState<'all' | 'incorrect'>('all');
  const questionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const score = useMemo(() => scoreQuiz(questions, answers), [questions, answers]);
  const passed = score >= passScore;

  const practiceScore = useMemo(
    () => scoreQuiz(questions, practiceAnswers),
    [questions, practiceAnswers]
  );

  const optionOrder = useMemo(
    () =>
      Object.fromEntries(
        questions
          .filter((q) => q.type === 'mcq')
          .map((q) => [q.id, shuffledMcqOptions(q)])
      ) as Record<string, string[]>,
    [questions]
  );

  const answeredCount = Object.keys(answers).length;
  const practiceAnsweredCount = Object.keys(practiceAnswers).length;

  const answerDisplay = (q: QuizQuestion): string => {
    if (q.type === 'tf') return q.answer ? 'True' : 'False';
    return String(q.answer);
  };

  const selectedAnswerDisplay = (q: QuizQuestion, value: string | boolean | undefined): string => {
    if (value === undefined) return 'Unanswered';
    if (q.type === 'tf') return value ? 'True' : 'False';
    return String(value);
  };

  const finalizeCompletionSubmit = () => {
    setSubmitted(true);
    setShowUnansweredWarning(false);
    onSubmit?.(score, passed);
    onDetailedSubmit?.({ score, passed, answers, questions });
    if (passed) onPass?.(score);
  };

  const submitCompletion = () => {
    const unanswered = questions.length - answeredCount;
    if (unanswered > 0) {
      setShowUnansweredWarning(true);
      const firstUnanswered = questions.find((q) => answers[q.id] === undefined);
      if (firstUnanswered) {
        window.setTimeout(() => {
          questionRefs.current[firstUnanswered.id]?.scrollIntoView({
            behavior: 'smooth',
            block: 'center'
          });
        }, 0);
      }
      return;
    }
    finalizeCompletionSubmit();
  };

  const submitPractice = () => {
    setPracticeSubmitted(true);
  };

  const startCompletionAttempt = () => {
    setAnswers({});
    setSubmitted(false);
    setShowUnansweredWarning(false);
    setReviewFilter('all');
    setCompletionMode(true);
  };

  const renderQuestion = (
    q: QuizQuestion,
    idx: number,
    currentAnswers: Record<string, string | boolean>,
    setCurrentAnswers: Dispatch<SetStateAction<Record<string, string | boolean>>>,
    showImmediateFeedback: boolean,
    isSubmitted: boolean,
    disabled: boolean
  ) => (
    <div
      key={q.id}
      ref={(node) => {
        questionRefs.current[q.id] = node;
      }}
      className="rounded border border-theme-border p-3"
    >
      <p className="mb-2 text-sm text-theme-text">
        {idx + 1}. {q.prompt}
      </p>
      {q.type === 'mcq' ? (
        <div className="space-y-2">
          {(optionOrder[q.id] ?? q.options ?? []).map((opt) => {
            const selected = currentAnswers[q.id] === opt;
            const showDeferredResult = isSubmitted;
            const isCorrectOption = q.answer === opt;
            const isIncorrectSelected = showDeferredResult && selected && !isCorrectOption;
            const isCorrectShown = showDeferredResult && isCorrectOption;
            const stateClass = isCorrectShown
              ? 'border-emerald-500 bg-emerald-500/10 text-emerald-200'
              : isIncorrectSelected
                ? 'border-rose-500 bg-rose-500/10 text-rose-200'
                : selected
                  ? 'border-amber-400 bg-amber-500/10 text-amber-100'
                  : 'border-theme-border bg-theme-panel text-theme-secondary';
            return (
              <label
                key={opt}
                className={`relative block w-full rounded border p-2.5 text-sm ${stateClass} ${
                  disabled
                    ? 'opacity-60'
                    : 'hover:border-theme-border cursor-pointer focus-within:ring-2 focus-within:ring-amber-400/60 focus-within:ring-offset-1 focus-within:ring-offset-slate-950'
                }`}
              >
                <input
                  type="radio"
                  name={`${q.id}-${disabled ? 'disabled' : 'active'}`}
                  checked={selected}
                  onChange={() => {
                    if (disabled) return;
                    setShowUnansweredWarning(false);
                    setCurrentAnswers((prev) => ({ ...prev, [q.id]: opt }));
                  }}
                  disabled={disabled}
                  className="absolute h-0 w-0 opacity-0"
                />
                <span>{opt}</span>
              </label>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 text-sm">
          {[true, false].map((value) => {
            const label = value ? 'True' : 'False';
            const selected = currentAnswers[q.id] === value;
            const showDeferredResult = isSubmitted;
            const isCorrectOption = q.answer === value;
            const isIncorrectSelected = showDeferredResult && selected && !isCorrectOption;
            const isCorrectShown = showDeferredResult && isCorrectOption;
            const stateClass = isCorrectShown
              ? 'border-emerald-500 bg-emerald-500/10 text-emerald-200'
              : isIncorrectSelected
                ? 'border-rose-500 bg-rose-500/10 text-rose-200'
                : selected
                  ? 'border-amber-400 bg-amber-500/10 text-amber-100'
                  : 'border-theme-border bg-theme-panel text-theme-secondary';
            return (
              <label
                key={label}
                className={`relative block w-full rounded border p-2.5 text-sm ${stateClass} ${
                  disabled
                    ? 'opacity-60'
                    : 'hover:border-theme-border cursor-pointer focus-within:ring-2 focus-within:ring-amber-400/60 focus-within:ring-offset-1 focus-within:ring-offset-slate-950'
                }`}
              >
                <input
                  type="radio"
                  name={`${q.id}-${disabled ? 'disabled' : 'active'}`}
                  checked={selected}
                  onChange={() => {
                    if (disabled) return;
                    setShowUnansweredWarning(false);
                    setCurrentAnswers((prev) => ({ ...prev, [q.id]: value }));
                  }}
                  disabled={disabled}
                  className="absolute h-0 w-0 opacity-0"
                />
                <span>{label}</span>
              </label>
            );
          })}
        </div>
      )}
      {/* Immediate feedback (practice mode) */}
      {showImmediateFeedback && currentAnswers[q.id] !== undefined ? (
        <div className="mt-2 space-y-1">
          <p
            className={`text-xs ${
              currentAnswers[q.id] === q.answer ? 'text-emerald-300' : 'text-rose-300'
            }`}
          >
            {currentAnswers[q.id] === q.answer
              ? 'Correct.'
              : `Incorrect. Correct answer: ${answerDisplay(q)}.`}
          </p>
          <p className="text-xs text-theme-secondary">{q.explanation}</p>
        </div>
      ) : null}
      {/* Deferred feedback (after completion submit) */}
      {!showImmediateFeedback && isSubmitted ? (
        <div className="mt-2 space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <span
              className={`rounded border px-1.5 py-0.5 font-semibold uppercase tracking-wide ${
                currentAnswers[q.id] === q.answer
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                  : 'border-rose-500/40 bg-rose-500/10 text-rose-300'
              }`}
            >
              {currentAnswers[q.id] === q.answer ? 'Correct' : 'Incorrect'}
            </span>
            <span className="text-theme-muted">
              Your answer:{' '}
              <span className="text-theme-secondary">
                {selectedAnswerDisplay(q, currentAnswers[q.id])}
              </span>
            </span>
            {currentAnswers[q.id] !== q.answer ? (
              <span className="text-theme-muted">
                Correct:{' '}
                <span className="text-emerald-300">{answerDisplay(q)}</span>
              </span>
            ) : null}
          </div>
          <p
            className={`text-xs ${
              currentAnswers[q.id] === q.answer ? 'text-emerald-300' : 'text-rose-300'
            }`}
          >
            {currentAnswers[q.id] === q.answer
              ? 'Correct.'
              : `Incorrect. Correct answer: ${answerDisplay(q)}.`}
          </p>
          <p className="text-xs text-theme-secondary">{q.explanation}</p>
        </div>
      ) : null}
    </div>
  );

  // Simple deferred-only mode (stage tests, no practice)
  if (!allowPracticeMode) {
    const reviewQuestions =
      submitted && reviewFilter === 'incorrect'
        ? questions.filter((q) => answers[q.id] !== q.answer)
        : questions;
    const incorrectCount = questions.filter((q) => answers[q.id] !== q.answer).length;
    return (
      <Card title={title}>
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs">
            <span className="text-theme-secondary">
              {answeredCount}/{questions.length} answered
            </span>
            {submitted ? (
              <span className={`font-semibold ${passed ? 'text-emerald-300' : 'text-rose-300'}`}>
                Score: {score}% (pass: {passScore}%)
              </span>
            ) : null}
          </div>
          {submitted ? (
            <div className="space-y-2">
              <p className={`text-sm ${passed ? 'text-emerald-300' : 'text-rose-300'}`}>
                {passed
                  ? `Passed (${score}%). Well done.`
                  : `Score: ${score}% — need ${passScore}% to pass.`}
              </p>
              {!passed ? (
                <button
                  className="rounded border border-amber-500/50 px-4 py-2 text-sm text-amber-200 hover:bg-amber-500/10"
                  onClick={() => {
                    setAnswers({});
                    setSubmitted(false);
                    setShowUnansweredWarning(false);
                    setReviewFilter('all');
                  }}
                  type="button"
                >
                  {labels.quizRetryLabel ?? 'Retry'}
                </button>
              ) : null}
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setReviewFilter('all')}
                  className={`rounded border px-2 py-1 text-xs ${
                    reviewFilter === 'all'
                      ? 'border-amber-400 bg-amber-500/10 text-amber-200'
                      : 'border-theme-border text-theme-secondary hover:border-theme-border'
                  }`}
                >
                  {(labels.quizAllFilterLabel ?? 'All')} ({questions.length})
                </button>
                <button
                  type="button"
                  onClick={() => setReviewFilter('incorrect')}
                  className={`rounded border px-2 py-1 text-xs ${
                    reviewFilter === 'incorrect'
                      ? 'border-amber-400 bg-amber-500/10 text-amber-200'
                      : 'border-theme-border text-theme-secondary hover:border-theme-border'
                  }`}
                >
                  {(labels.quizIncorrectFilterLabel ?? 'Incorrect only')} ({incorrectCount})
                </button>
              </div>
            </div>
          ) : null}
          {reviewQuestions.map((q, idx) =>
            renderQuestion(
              q,
              idx,
              answers,
              setAnswers,
              feedbackMode === 'immediate',
              submitted,
              submitted
            )
          )}
          {!submitted ? (
            <div className="space-y-2">
              {showUnansweredWarning ? (
                <div className="rounded border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-200">
                  {questions.length - answeredCount} question{questions.length - answeredCount === 1 ? '' : 's'} unanswered — unanswered questions score as incorrect.
                  <div className="mt-1 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={finalizeCompletionSubmit}
                      className="text-amber-200 underline underline-offset-2 hover:text-amber-100"
                    >
                      {labels.quizSubmitAnywayLabel ?? 'Submit anyway'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowUnansweredWarning(false)}
                      className="text-theme-secondary underline underline-offset-2 hover:text-theme-text"
                    >
                      {labels.quizGoBackLabel ?? 'Go back'}
                    </button>
                  </div>
                </div>
              ) : null}
              <button
                className="rounded bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400"
                onClick={submitCompletion}
                type="button"
              >
                {labels.quizSubmitLabel ?? 'Submit Quiz'}
              </button>
            </div>
          ) : null}
        </div>
      </Card>
    );
  }

  // Practice + Completion mode
  const completionReviewQuestions =
    submitted && reviewFilter === 'incorrect'
      ? questions.filter((q) => answers[q.id] !== q.answer)
      : questions;
  const completionIncorrectCount = questions.filter((q) => answers[q.id] !== q.answer).length;
  return (
    <Card title={title}>
      <div className="space-y-5">
        {/* Practice section */}
        {!completionMode ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-amber-300">
                Practice first — answers shown immediately. This does not count for lesson completion.
              </p>
              <span className="text-xs text-theme-secondary">
                {practiceAnsweredCount}/{questions.length} answered
              </span>
            </div>
            {questions.map((q, idx) =>
              renderQuestion(
                q,
                idx,
                practiceAnswers,
                setPracticeAnswers,
                true,
                practiceSubmitted,
                false
              )
            )}
            {!practiceSubmitted ? (
              <div className="flex flex-wrap gap-3">
                <button
                  className="rounded border border-theme-border px-4 py-2 text-sm text-theme-secondary hover:border-theme-border"
                  onClick={submitPractice}
                  type="button"
                >
                  {labels.quizSeePracticeScoreLabel ?? 'See Practice Score'}
                </button>
                <button
                  className="rounded bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400"
                  onClick={startCompletionAttempt}
                  type="button"
                >
                  {labels.quizStartScoredCheckLabel ?? 'Start scored check (counts for completion)'}
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className={`text-sm ${practiceScore >= passScore ? 'text-emerald-300' : 'text-amber-300'}`}>
                  Practice score: {practiceScore}%
                  {practiceScore >= passScore
                    ? ' — ready for completion check.'
                    : ` — below ${passScore}% pass mark. Review explanations, then try the completion check.`}
                </p>
                <button
                  className="rounded bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400"
                  onClick={startCompletionAttempt}
                  type="button"
                >
                  {labels.quizStartScoredCheckLabel ?? 'Start scored check (counts for completion)'}
                </button>
              </div>
            )}
          </div>
        ) : (
          /* Completion Check section */
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-sky-300">
                Completion Check — no answer reveal until submitted
              </p>
              <span className="text-xs text-theme-secondary">
                {answeredCount}/{questions.length} answered
              </span>
            </div>
            <p className="text-xs text-theme-secondary">
              Answers are hidden until you submit. Pass at {passScore}% or above to earn lesson
              completion credit.
            </p>
            {submitted ? (
              <div className="space-y-2">
                <p
                  className={`rounded border p-2 text-sm font-semibold ${
                    passed
                      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                      : 'border-rose-500/40 bg-rose-500/10 text-rose-300'
                  }`}
                >
                  {passed ? `Passed (${score}%). Well done.` : `Score: ${score}% — need ${passScore}% to pass.`}
                </p>
                {passed && completionSuccessContent ? <div>{completionSuccessContent}</div> : null}
                {!passed ? (
                  <button
                    className="rounded border border-amber-500/50 px-4 py-2 text-sm text-amber-200 hover:bg-amber-500/10"
                    onClick={() => {
                      setAnswers({});
                      setSubmitted(false);
                      setShowUnansweredWarning(false);
                      setReviewFilter('all');
                    }}
                    type="button"
                  >
                    {labels.quizRetryLabel ?? 'Retry'} Completion Check
                  </button>
                ) : null}
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setReviewFilter('all')}
                    className={`rounded border px-2 py-1 text-xs ${
                      reviewFilter === 'all'
                        ? 'border-amber-400 bg-amber-500/10 text-amber-200'
                        : 'border-theme-border text-theme-secondary hover:border-theme-border'
                    }`}
                  >
                    {(labels.quizAllFilterLabel ?? 'All')} ({questions.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setReviewFilter('incorrect')}
                    className={`rounded border px-2 py-1 text-xs ${
                      reviewFilter === 'incorrect'
                        ? 'border-amber-400 bg-amber-500/10 text-amber-200'
                        : 'border-theme-border text-theme-secondary hover:border-theme-border'
                    }`}
                  >
                    {(labels.quizIncorrectFilterLabel ?? 'Incorrect only')} ({completionIncorrectCount})
                  </button>
                </div>
              </div>
            ) : null}
            {completionReviewQuestions.map((q, idx) =>
              renderQuestion(
                q,
                idx,
                answers,
                setAnswers,
                false,
                submitted,
                submitted
              )
            )}
            {!submitted ? (
              <div className="space-y-2">
                {showUnansweredWarning ? (
                  <div className="rounded border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-200">
                    {questions.length - answeredCount} question{questions.length - answeredCount === 1 ? '' : 's'} unanswered — unanswered questions score as incorrect.
                    <div className="mt-1 flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={finalizeCompletionSubmit}
                        className="text-amber-200 underline underline-offset-2 hover:text-amber-100"
                      >
                        {labels.quizSubmitAnywayLabel ?? 'Submit anyway'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowUnansweredWarning(false)}
                        className="text-theme-secondary underline underline-offset-2 hover:text-theme-text"
                      >
                        {labels.quizGoBackLabel ?? 'Go back'}
                      </button>
                    </div>
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-3">
                <button
                  className="rounded bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400"
                  onClick={submitCompletion}
                  type="button"
                >
                  {labels.quizSubmitCompletionLabel ?? 'Submit for Completion'}
                </button>
                <button
                  className="rounded border border-theme-border px-3 py-2 text-xs text-theme-secondary hover:border-theme-border"
                  onClick={() => {
                    setCompletionMode(false);
                    setPracticeAnswers({});
                    setPracticeSubmitted(false);
                    setReviewFilter('all');
                  }}
                  type="button"
                >
                  {labels.quizBackToPracticeLabel ?? 'Back to Practice'}
                </button>
                </div>
              </div>
            ) : null}
            {submitted && !passed ? (
              <div className="flex flex-wrap gap-3">
                <button
                  className="rounded border border-theme-border px-3 py-2 text-xs text-theme-secondary hover:border-theme-border"
                  onClick={() => {
                    setCompletionMode(false);
                    setPracticeAnswers({});
                    setPracticeSubmitted(false);
                    setShowUnansweredWarning(false);
                    setReviewFilter('all');
                  }}
                  type="button"
                >
                  {labels.quizReturnToPracticeLabel ?? 'Return to Practice'}
                </button>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </Card>
  );
};
