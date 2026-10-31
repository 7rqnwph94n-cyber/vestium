import { useMemo, useState } from 'react';
import {
  clearProviderKey,
  listProviderConfigMeta,
  readProviderKeyDetails,
  testProviderKey,
  writeProviderKey,
  type EvidenceProviderId
} from '../validation/evidenceProviders';

interface ProviderStatus {
  state: 'idle' | 'testing' | 'ok' | 'error';
  message?: string;
}

function maskKey(key: string): string {
  if (key.length < 8) return 'Stored';
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

export function ProviderKeysPanel() {
  const providers = useMemo(() => listProviderConfigMeta(), []);
  const [isOpen, setIsOpen] = useState(false);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [statuses, setStatuses] = useState<Record<string, ProviderStatus>>({});
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [batchTesting, setBatchTesting] = useState(false);
  const [batchSummary, setBatchSummary] = useState<string | null>(null);

  const setStatus = (providerId: EvidenceProviderId, status: ProviderStatus) => {
    setStatuses((prev) => ({ ...prev, [providerId]: status }));
  };

  const setInput = (providerId: EvidenceProviderId, value: string) => {
    setInputs((prev) => ({ ...prev, [providerId]: value }));
    setStatuses((prev) => ({ ...prev, [providerId]: { state: 'idle' } }));
  };

  const handleTestAndSave = async (providerId: EvidenceProviderId) => {
    const value = (inputs[providerId] ?? '').trim();
    if (!value) {
      setStatus(providerId, { state: 'error', message: 'Enter a key before testing.' });
      return;
    }

    setStatus(providerId, { state: 'testing' });
    const result = await testProviderKey(providerId, value);
    if (result.ok) {
      writeProviderKey(providerId, value);
      setStatus(providerId, { state: 'ok', message: 'Key is valid and saved.' });
      setInputs((prev) => ({ ...prev, [providerId]: '' }));
    } else {
      setStatus(providerId, { state: 'error', message: result.error ?? 'Validation failed.' });
    }
  };

  const handleForget = (providerId: EvidenceProviderId) => {
    clearProviderKey(providerId);
    setInputs((prev) => ({ ...prev, [providerId]: '' }));
    setStatus(providerId, { state: 'ok', message: 'Saved key removed.' });
  };

  const handleBatchTestConfiguredKeys = async () => {
    setBatchTesting(true);
    setBatchSummary(null);
    try {
      const keyProviders = providers.filter((provider) => provider.requiresKey);
      let configured = 0;
      let passed = 0;
      const failed: string[] = [];

      for (const provider of keyProviders) {
        const details = readProviderKeyDetails(provider.id);
        if (!details.key) {
          failed.push(`${provider.label} (missing key)`);
          continue;
        }
        configured += 1;
        const result = await testProviderKey(provider.id, details.key);
        if (result.ok) {
          passed += 1;
          setStatus(provider.id, {
            state: 'ok',
            message: details.source === 'env' ? 'Env key verified.' : 'Saved key verified.'
          });
        } else {
          failed.push(`${provider.label} (${result.error ?? 'validation failed'})`);
          setStatus(provider.id, { state: 'error', message: result.error ?? 'Validation failed.' });
        }
      }

      const failedList = failed.slice(0, 3).join('; ');
      const extraFailed = failed.length > 3 ? ` (+${failed.length - 3} more)` : '';
      setBatchSummary(
        failed.length === 0
          ? `Configured keys verified: ${passed}/${configured}.`
          : `Configured keys verified: ${passed}/${configured}. Issues: ${failedList}${extraFailed}`
      );
    } finally {
      setBatchTesting(false);
    }
  };

  return (
    <section className="space-y-4 rounded border border-theme-border bg-theme-panel/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-theme-text">External Evidence API Keys</h3>
          <p className="mt-1 text-xs text-theme-secondary">
            Optional but recommended. Improves factual verification, source discovery, and contextual image enrichment.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          className="rounded border border-theme-border px-2.5 py-1.5 text-xs font-medium text-theme-text hover:border-theme-border"
          aria-expanded={isOpen}
          aria-controls="provider-keys-content"
        >
          {isOpen ? 'Hide' : 'Show'}
        </button>
      </div>

      {isOpen ? (
        <div id="provider-keys-content" className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void handleBatchTestConfiguredKeys()}
              disabled={batchTesting}
              className="rounded border border-violet-500/50 bg-violet-500/10 px-2.5 py-1.5 text-xs font-medium text-violet-200 hover:bg-violet-500/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {batchTesting ? 'Testing configured keys...' : 'Test configured keys (env/local)'}
            </button>
            {batchSummary ? <span className="text-[11px] text-theme-secondary">{batchSummary}</span> : null}
          </div>

          <div className="space-y-4">
            {providers.map((provider) => {
              const keyDetails = readProviderKeyDetails(provider.id);
              const savedKey = keyDetails.key;
              const status = statuses[provider.id] ?? { state: 'idle' as const };
              const inputValue = inputs[provider.id] ?? '';
              const keyVisible = showKeys[provider.id] ?? false;

              return (
                <div key={provider.id} className="rounded border border-theme-border bg-theme-surface/50 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-theme-text">{provider.label}</p>
                      <p className="mt-0.5 text-xs text-theme-muted">{provider.description}</p>
                      <a
                        href={provider.docsUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-block text-xs text-violet-300 hover:text-violet-200"
                      >
                        API docs
                      </a>
                    </div>
                    {!provider.requiresKey && (
                      <span className="rounded border border-emerald-700 bg-emerald-900/30 px-2 py-0.5 text-[11px] text-emerald-300">
                        No key required
                      </span>
                    )}
                  </div>

                  {provider.requiresKey && (
                    <div className="mt-3 space-y-2">
                      <div className="relative">
                        <input
                          type={keyVisible ? 'text' : 'password'}
                          value={inputValue}
                          onChange={(e) => setInput(provider.id, e.target.value)}
                          placeholder={`Enter ${provider.label} key`}
                          className="w-full rounded border border-theme-border bg-theme-panel px-3 py-2 pr-14 text-xs text-theme-text placeholder-slate-600 focus:border-violet-500 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => setShowKeys((prev) => ({ ...prev, [provider.id]: !keyVisible }))}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-theme-muted hover:text-theme-secondary"
                        >
                          {keyVisible ? 'Hide' : 'Show'}
                        </button>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void handleTestAndSave(provider.id)}
                          disabled={inputValue.trim().length < 6 || status.state === 'testing'}
                          className="rounded bg-violet-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {status.state === 'testing' ? 'Testing...' : 'Test & Save'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleForget(provider.id)}
                          className="rounded border border-theme-border px-2.5 py-1.5 text-xs text-theme-secondary hover:bg-theme-raised/50"
                        >
                          {keyDetails.source === 'env' ? 'Clear local override' : 'Forget'}
                        </button>
                        {savedKey && (
                          <span className="text-[11px] text-emerald-300">
                            {keyDetails.source === 'env' ? 'Loaded from .env.local' : 'Saved in browser'}: {maskKey(savedKey)}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {status.state !== 'idle' && (
                    <p
                      className={`mt-2 text-[11px] ${
                        status.state === 'error' ? 'text-red-400' : status.state === 'testing' ? 'text-theme-secondary' : 'text-emerald-300'
                      }`}
                    >
                      {status.message ?? (status.state === 'testing' ? 'Testing API key...' : '')}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}
