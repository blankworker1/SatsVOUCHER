import { Voucher, Currency } from './types';

export const CURRENCIES: Currency[] = [
  { code: 'USD', symbol: '$', rate: 1 },
  { code: 'EUR', symbol: '€', rate: 0.92 },
  { code: 'GBP', symbol: '£', rate: 0.78 },
  { code: 'JPY', symbol: '¥', rate: 149.50 },
];

export const INITIAL_VOUCHERS: Voucher[] = [
  {
    id: '8XJ-92L',
    amountBtc: 0.0015,
    amountUsd: 100.25,
    date: 'Oct 24, 2023',
    status: 'active',
    type: 'standard'
  },
  {
    id: '4PP-01M',
    amountBtc: 0.0050,
    amountUsd: 334.12,
    date: 'Oct 22, 2023',
    status: 'printed',
    type: 'standard'
  },
  {
    id: '2ZZ-74K',
    amountBtc: 0.0120,
    amountUsd: 801.89,
    date: 'Oct 18, 2023',
    status: 'claimed',
    type: 'standard'
  },
  {
    id: '9LL-11X',
    amountBtc: 0.0008,
    amountUsd: 53.46,
    date: 'Oct 15, 2023',
    status: 'active',
    type: 'standard'
  }
];

export const BTC_PRICE = 66824.12;
