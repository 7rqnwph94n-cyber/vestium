import { useMemo, useState } from 'react';
import { YouTry as YouTryType } from '../lib/training-core/types';
import { Card } from './Card';
import { getSimulatorYouTryChallenge } from '../features/learning/simulatorYouTry';

export const YouTry = ({ item, lessonId }: { item: YouTryType; lessonId?: string }) => {
  const [selected, setSelected] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const simulatorChallenge = lessonId ? getSimulatorYouTryChallenge(lessonId) : null;
  const effectiveItem = simulatorChallenge
    ? ({
        ...item,
        type: 'mcq',
        prompt: simulatorChallenge.prompt,
        options: simulatorChallenge.options,
        answer: simulatorChallenge.answer,
        feedback: simulatorChallenge.feedback
      } as YouTryType)
    : item;

  const isCorrect = useMemo(() => {
    if (!submitted) return false;
    if (effectiveItem.type === 'ordering') {
      return JSON.stringify(selected) === JSON.stringify(effectiveItem.answer);
    }
    return selected[0] === effectiveItem.answer;
  }, [effectiveItem.answer, effectiveItem.type, selected, submitted]);

  const toggle = (value: string) => {
    if (effectiveItem.type === 'ordering') {
      setSelected((prev) => {
        if (prev.includes(value)) return prev.filter((v) => v !== value);
        return [...prev, value];
      });
    } else {
      setSelected([value]);
    }
  };

  return (
    <Card title="You Try">
      {simulatorChallenge ? (
        <div className="mb-3 rounded border border-sky-500/20 bg-sky-500/5 p-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-sky-300">
            Simulator-State Challenge
          </p>
          <div className="mt-2 space-y-1 text-xs text-theme-secondary">
            {simulatorChallenge.stateLines.map((line, index) => (
              <p key={index} className="font-mono text-[11px] leading-relaxed">
                {line}
              </p>
            ))}
          </div>
        </div>
      ) : null}
      <p className="mb-3 text-sm text-theme-text">{effectiveItem.prompt}</p>
      <div className="space-y-2">
        {effectiveItem.options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => toggle(option)}
            className={`block w-full rounded border px-3 py-2 text-left text-sm ${
              selected.includes(option)
                ? 'border-amber-400 bg-amber-500/20 text-amber-100'
                : 'border-theme-border bg-theme-panel text-theme-secondary'
            }`}
          >
            {option}
          </button>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button
          onClick={() => setSubmitted(true)}
          className="rounded bg-theme-raised px-3 py-2 text-xs font-semibold text-theme-text hover:bg-theme-raised"
          type="button"
        >
          Check Answer
        </button>
        {item.type === 'ordering' ? (
          <button
            onClick={() => setSelected([])}
            className="rounded border border-theme-border px-3 py-2 text-xs text-theme-text"
            type="button"
          >
            Clear Order
          </button>
        ) : null}
      </div>
        {submitted ? (
        <p className={`mt-2 text-sm ${isCorrect ? 'text-emerald-300' : 'text-rose-300'}`}>
          {isCorrect ? 'Correct.' : 'Not quite yet.'} {effectiveItem.feedback}
        </p>
      ) : null}
      {effectiveItem.type === 'ordering' ? <p className="mt-2 text-xs text-theme-muted">Selection order matters for this challenge.</p> : null}
    </Card>
  );
};
