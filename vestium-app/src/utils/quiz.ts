import { QuizQuestion } from '../lib/training-core/types';

export const scoreQuiz = (questions: QuizQuestion[], answers: Record<string, string | boolean>): number => {
  if (!questions.length) return 0;
  const correct = questions.filter((q) => answers[q.id] === q.answer).length;
  return Math.round((correct / questions.length) * 100);
};

const hashSeed = (value: string): number => {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const nextRand = (seed: number): number => {
  const next = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return next;
};

export const shuffledMcqOptions = (question: QuizQuestion): string[] => {
  if (question.type !== 'mcq') return [];
  const options = [...(question.options ?? [])];
  let seed = hashSeed(`${question.id}|${question.prompt}`);
  for (let i = options.length - 1; i > 0; i -= 1) {
    seed = nextRand(seed);
    const j = seed % (i + 1);
    [options[i], options[j]] = [options[j], options[i]];
  }
  return options;
};

