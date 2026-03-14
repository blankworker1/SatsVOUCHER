export type Screen = 'dashboard' | 'create-voucher' | 'voucher-details' | 'print-receipt' | 'printer-config' | 'settings' | 'vouchers-list';

export type CurrencyCode = 'USD' | 'EUR' | 'GBP' | 'JPY';

export interface Currency {
  code: CurrencyCode;
  symbol: string;
  rate: number; // Rate relative to USD (1 USD = rate units of this currency)
}

export interface Voucher {
  id: string;
  amountBtc: number;
  amountUsd: number;
  date: string;
  status: 'active' | 'printed' | 'claimed';
  type: 'standard' | 'gift';
  expiryDate?: string;
  lnurl?: string;
}

export interface AppState {
  currentScreen: Screen;
  vouchers: Voucher[];
  selectedVoucher?: Voucher;
}
