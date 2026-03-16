import { useState, useEffect, useCallback } from 'react';
import { AppSettings } from '../types';
import { loadSettings, saveSettings, isConfigured } from '../services/settings';
import { clearPriceCache } from '../services/btcPrice';

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSettings().then(s => {
      setSettings(s);
      setLoading(false);
    });
  }, []);

  const update = useCallback(async (updated: AppSettings) => {
    await saveSettings(updated);
    setSettings(updated);
    // Clear price cache when settings change in case currency changed
    clearPriceCache();
  }, []);

  return {
    settings,
    loading,
    update,
    configured: settings ? isConfigured(settings) : false,
  };
}
