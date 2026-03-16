import AsyncStorage from '@react-native-async-storage/async-storage';
import { LocalVoucher } from '../types';

const LIST_KEY = 'satsvoucher:voucher_ids';
const VOUCHER_PREFIX = 'satsvoucher:voucher:';

export async function saveVoucher(voucher: LocalVoucher): Promise<void> {
  // Store the voucher object
  await AsyncStorage.setItem(
    `${VOUCHER_PREFIX}${voucher.id}`,
    JSON.stringify(voucher),
  );
  // Prepend to the ordered ID list
  const ids = await getVoucherIds();
  const updated = [voucher.id, ...ids.filter(id => id !== voucher.id)];
  await AsyncStorage.setItem(LIST_KEY, JSON.stringify(updated));
}

export async function updateVoucher(voucher: LocalVoucher): Promise<void> {
  await AsyncStorage.setItem(
    `${VOUCHER_PREFIX}${voucher.id}`,
    JSON.stringify(voucher),
  );
}

export async function getVoucher(id: string): Promise<LocalVoucher | null> {
  const raw = await AsyncStorage.getItem(`${VOUCHER_PREFIX}${id}`);
  return raw ? JSON.parse(raw) : null;
}

export async function getVoucherIds(): Promise<string[]> {
  const raw = await AsyncStorage.getItem(LIST_KEY);
  return raw ? JSON.parse(raw) : [];
}

export async function getRecentVouchers(limit = 50): Promise<LocalVoucher[]> {
  const ids = await getVoucherIds();
  const vouchers: LocalVoucher[] = [];
  for (const id of ids.slice(0, limit)) {
    const v = await getVoucher(id);
    if (v) vouchers.push(v);
  }
  return vouchers;
}
