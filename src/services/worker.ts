import { AppSettings, LocalVoucher, VoucherStatus } from '../types';

export interface CreateVoucherParams {
  amountBtc: number;
  amountFiat: number;
  currency: string;
  expiryDays: number;
}

export interface CreateVoucherResponse {
  id: string;
  lnurl: string;
  expiryDate: string;
  createdAt: string;
}

export interface WorkerVoucherStatus {
  id: string;
  status: VoucherStatus;
  amountBtc: number;
  amountFiat: number;
  currency: string;
  createdAt: string;
  expiryDate: string;
  claimedAt: string | null;
}

export async function createVoucher(
  params: CreateVoucherParams,
  settings: AppSettings,
): Promise<CreateVoucherResponse> {
  const url = `${settings.workerUrl.replace(/\/$/, '')}/voucher`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Worker-Secret': settings.workerSecret,
    },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error((err as any).error ?? `Worker error ${response.status}`);
  }

  return response.json();
}

export async function fetchVoucherStatus(
  id: string,
  settings: AppSettings,
): Promise<WorkerVoucherStatus> {
  const url = `${settings.workerUrl.replace(/\/$/, '')}/voucher/${id}`;

  const response = await fetch(url);

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error((err as any).error ?? `Worker error ${response.status}`);
  }

  return response.json();
}
