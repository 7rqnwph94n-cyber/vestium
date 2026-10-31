import { ProgressState } from '../../types/progress';
import { STORAGE_KEY } from '../../utils/constants';
import { getProgress, saveProgressToServer } from '../../lib/api/client';
import { initialProgressState } from './store';

interface StoredProgress {
  version: 1;
  data: ProgressState;
}

// ─── localStorage persistence (fast, offline-capable) ─────────────────────────

export const loadProgress = (): ProgressState => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialProgressState;
    const parsed = JSON.parse(raw) as StoredProgress;
    if (parsed.version !== 1) return initialProgressState;
    const merged = {
      ...initialProgressState,
      ...parsed.data
    };
    const normalizedAdaptiveItems = merged.adaptiveItems ?? merged.reviewItems ?? {};
    return {
      ...merged,
      adaptiveItems: normalizedAdaptiveItems,
      reviewItems: normalizedAdaptiveItems
    };
  } catch {
    return initialProgressState;
  }
};

export const saveProgress = (state: ProgressState): void => {
  const normalizedAdaptiveItems = state.adaptiveItems ?? state.reviewItems ?? {};
  const payload: StoredProgress = {
    version: 1,
    data: {
      ...state,
      adaptiveItems: normalizedAdaptiveItems,
      reviewItems: normalizedAdaptiveItems
    }
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
};

// ─── Server persistence (durable, cross-device) ──────────────────────────────

export async function loadServerProgress(
  token: string,
  moduleId: string
): Promise<ProgressState | null> {
  try {
    const res = await getProgress(token, moduleId);
    if (!res.ok || !res.data) return null;
    const serverData = res.data.progress as Partial<ProgressState>;
    return { ...initialProgressState, ...serverData };
  } catch {
    return null;
  }
}

export async function syncProgressToServer(
  token: string,
  moduleId: string,
  state: ProgressState,
  score?: number,
  completed?: boolean
): Promise<void> {
  try {
    await saveProgressToServer(token, moduleId, {
      progress: state,
      score,
      completed,
    });
  } catch {
    // Server sync is best-effort; localStorage is the primary store
  }
}
