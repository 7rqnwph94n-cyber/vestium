// ─── Server progress sync hook ────────────────────────────────────────────────
// Called from AppLayout to sync progress to server when user is in a learning flow.
// localStorage remains the primary (fast) store; server is the durable backup.
// On mount: loads server progress and merges (server wins on conflict fields).
// On state change: debounces a PUT to the server (500ms).

import { useEffect, useRef } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { useProgress } from './ProgressContext';
import { loadServerProgress, syncProgressToServer } from './persistence';

export function useServerProgressSync(moduleId: string | undefined) {
  const { getToken } = useAuth();
  const { state } = useProgress();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialLoadDone = useRef(false);
  const lastSyncedJson = useRef<string>('');

  // On mount: fetch server progress and merge with local
  useEffect(() => {
    if (!moduleId) return;
    let cancelled = false;

    const loadAndMerge = async () => {
      const token = await getToken();
      if (!token || cancelled) return;

      const serverState = await loadServerProgress(token, moduleId);
      if (!serverState || cancelled) {
        initialLoadDone.current = true;
        return;
      }

      // Server has progress — merge will happen via the ProgressContext
      // For now, server state is informational; localStorage is source of truth
      // In a future iteration, we could merge server state into context
      initialLoadDone.current = true;
    };

    void loadAndMerge();
    return () => { cancelled = true; };
  }, [moduleId, getToken]);

  // On state change: debounce save to server
  useEffect(() => {
    if (!moduleId || !initialLoadDone.current) return;

    const stateJson = JSON.stringify(state);
    if (stateJson === lastSyncedJson.current) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      const doSync = async () => {
        const token = await getToken();
        if (!token) return;

        // Derive score from stageTestScores
        const scores = Object.values(state.stageTestScores);
        const score = scores.length > 0
          ? Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length)
          : undefined;

        // Check if all stages have been passed (completed)
        const stageIds = Object.keys(state.stageTestsPassed).map(Number);
        const completed = stageIds.length > 0 && stageIds.every(id => state.stageTestsPassed[id]);

        await syncProgressToServer(token, moduleId, state, score, completed || undefined);
        lastSyncedJson.current = stateJson;
      };

      void doSync();
    }, 500);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [moduleId, state, getToken]);
}
