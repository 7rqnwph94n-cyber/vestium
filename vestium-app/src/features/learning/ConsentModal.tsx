// ─── ConsentModal ────────────────────────────────────────────────────────────
// Shown before the first verbal response submission per session.
// Captures consent for audio_capture + transcript_storage.
// Calls POST /api/consent for each consent type, then invokes onConsented().

import { useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { API_URL } from '../../lib/api/client';

interface Props {
  onConsented: () => void;
  onDeclined: () => void;
}

const CONSENT_VERSION = '1.0';

export function ConsentModal({ onConsented, onDeclined }: Props) {
  const { getToken } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGrant() {
    setSubmitting(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error('Not authenticated');

      for (const consentType of ['audio_capture', 'transcript_storage'] as const) {
        const res = await fetch(`${API_URL}/api/consent`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ consentType, consentVersion: CONSENT_VERSION }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({ error: 'Unknown error' }));
          throw new Error((body as { error?: string }).error ?? `Failed: ${res.status}`);
        }
      }
      onConsented();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record consent');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="mx-4 max-w-lg rounded-lg border border-theme-border bg-theme-surface p-6 shadow-lg">
        <h2 className="mb-4 text-lg font-semibold text-theme-text">
          Audio & Transcript Consent
        </h2>

        <div className="mb-4 space-y-3 text-sm text-theme-text-secondary">
          <p>
            This verbal assessment requires recording your audio response.
            Your recording will be:
          </p>
          <ul className="ml-4 list-disc space-y-1">
            <li>Transcribed using speech-to-text technology (Whisper)</li>
            <li>Assessed for regulatory competency (Claude AI)</li>
            <li>Stored securely and subject to your organisation's data retention policy</li>
            <li>Available for manager review as part of competency evidence</li>
          </ul>
          <p>
            You may revoke consent at any time. Revoking consent will prevent future
            verbal submissions but will not delete existing records — contact your
            organisation administrator to request data deletion under GDPR Article 17.
          </p>
        </div>

        {error && (
          <p className="mb-3 text-sm text-red-400">{error}</p>
        )}

        <div className="flex gap-3">
          <button
            onClick={handleGrant}
            disabled={submitting}
            className="flex-1 rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {submitting ? 'Recording consent...' : 'I consent'}
          </button>
          <button
            onClick={onDeclined}
            disabled={submitting}
            className="flex-1 rounded border border-theme-border px-4 py-2 text-sm text-theme-text hover:bg-theme-bg"
          >
            Decline
          </button>
        </div>
      </div>
    </div>
  );
}
