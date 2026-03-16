export type Currency = 'GBP' | 'USD' | 'EUR';
export type PriceSource = 'coingecko' | 'manual';
export type VoucherStatus = 'active' | 'claimed' | 'expired';

export interface AppSettings {
  // Required — Lightning wallet
  blinkApiKey: string;
  blinkWalletId: string;
  // Required — Cloudflare Worker
  workerUrl: string;
  workerSecret: string;
  // Store identity
  storeName: string;
  operatorName: string;
  // Currency
  currency: Currency;
  // Voucher rules
  minAmountFiat: number;
  maxAmountFiat: number;
  expiryDays: number;
  // Receipt
  receiptHeader: string;
  receiptFooter: string;
  // Security
  settingsPin: string;
  // BTC price
  priceSource: PriceSource;
  priceRefreshMinutes: number;
  manualBtcPrice: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  blinkApiKey: '',
  blinkWalletId: '',
  workerUrl: '',
  workerSecret: '',
  storeName: '',
  operatorName: '',
  currency: 'GBP',
  minAmountFiat: 1.0,
  maxAmountFiat: 500.0,
  expiryDays: 90,
  receiptHeader: 'Thank you for your purchase',
  receiptFooter: 'Non-refundable. Valid for stated period.',
  settingsPin: '',
  priceSource: 'coingecko',
  priceRefreshMinutes: 5,
  manualBtcPrice: 0,
};

export interface LocalVoucher {
  id: string;
  lnurl: string;
  amountFiat: number;
  amountBtc: number;
  currency: Currency;
  btcPriceAtSale: number;
  createdAt: string;   // ISO
  expiryDate: string;  // ISO
  // Cached status — updated when cashier checks
  status: VoucherStatus;
  checkedAt?: string;  // ISO — last time status was fetched
}

export const CURRENCY_SYMBOL: Record<Currency, string> = {
  GBP: '£',
  USD: '$',
  EUR: '€',
};
