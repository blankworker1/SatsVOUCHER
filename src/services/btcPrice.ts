import { Currency, AppSettings } from '../types';

// CoinGecko currency IDs
const CG_CURRENCY: Record<Currency, string> = {
  GBP: 'gbp',
  USD: 'usd',
  EUR: 'eur',
};

let cachedPrice: number | null = null;
let cacheTimestamp: number = 0;

export async function getBtcPrice(settings: AppSettings): Promise<number> {
  if (settings.priceSource === 'manual' && settings.manualBtcPrice > 0) {
    return settings.manualBtcPrice;
  }

  const maxAgeMs = settings.priceRefreshMinutes * 60 * 1000;
  const now = Date.now();

  if (cachedPrice !== null && now - cacheTimestamp < maxAgeMs) {
    return cachedPrice;
  }

  const currency = CG_CURRENCY[settings.currency];
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=${currency}`;

  const response = await fetch(url);
  if (!response.ok) {
    // Return stale cache if available rather than crashing
    if (cachedPrice !== null) return cachedPrice;
    throw new Error('Unable to fetch BTC price');
  }

  const data: any = await response.json();
  const price: number = data.bitcoin?.[currency];

  if (!price || price <= 0) {
    if (cachedPrice !== null) return cachedPrice;
    throw new Error('Invalid price data from CoinGecko');
  }

  cachedPrice = price;
  cacheTimestamp = now;
  return price;
}

export function fiatToBtc(fiatAmount: number, btcPrice: number): number {
  return fiatAmount / btcPrice;
}

export function formatBtc(btc: number): string {
  return btc.toFixed(8);
}

// Clear price cache (e.g. when settings change)
export function clearPriceCache(): void {
  cachedPrice = null;
  cacheTimestamp = 0;
}
