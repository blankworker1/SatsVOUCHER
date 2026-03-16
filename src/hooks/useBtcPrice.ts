import { useState, useEffect, useRef } from 'react';
import { AppSettings } from '../types';
import { getBtcPrice } from '../services/btcPrice';

export function useBtcPrice(settings: AppSettings | null) {
  const [price, setPrice] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!settings) return;

    const fetch = async () => {
      try {
        const p = await getBtcPrice(settings);
        setPrice(p);
        setError(null);
      } catch (e: any) {
        setError(e?.message ?? 'Price unavailable');
      }
    };

    fetch();

    const intervalMs = settings.priceRefreshMinutes * 60 * 1000;
    intervalRef.current = setInterval(fetch, intervalMs);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [settings]);

  return { price, error };
}
