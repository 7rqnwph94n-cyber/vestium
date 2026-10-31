import { useState } from 'react';
import { getCredentialsStore } from '../api/clientFactory';

export interface UseApiKeyReturn {
  apiKey: string;
  hasKey: boolean;
  isTesting: boolean;
  testError: string | null;
  saveKey: (key: string) => void;
  forgetKey: () => void;
  testAndSave: (key: string) => Promise<boolean>;
}

export function useApiKey(): UseApiKeyReturn {
  const credentials = getCredentialsStore();
  const [apiKey, setApiKey] = useState<string>(() => credentials.getStoredApiKey());
  const [isTesting, setIsTesting] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);

  const saveKey = (key: string) => {
    credentials.saveApiKey(key);
    setApiKey(key.trim());
    setTestError(null);
  };

  const forgetKey = () => {
    credentials.clearApiKey();
    setApiKey('');
    setTestError(null);
  };

  const testAndSave = async (key: string): Promise<boolean> => {
    setIsTesting(true);
    setTestError(null);
    try {
      const result = await credentials.testApiKey(key);
      if (result.ok) {
        saveKey(key);
        return true;
      } else {
        setTestError(result.error ?? 'Connection test failed');
        return false;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setTestError(msg);
      return false;
    } finally {
      setIsTesting(false);
    }
  };

  return {
    apiKey,
    hasKey: apiKey.length > 10,
    isTesting,
    testError,
    saveKey,
    forgetKey,
    testAndSave
  };
}
