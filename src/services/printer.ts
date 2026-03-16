/**
 * Sunmi V2S thermal printer service.
 * Wraps react-native-sunmi-printer with a clean interface.
 *
 * Install: npm install react-native-sunmi-printer
 * The package auto-links on Android. No extra configuration needed
 * on Sunmi devices — the AIDL service is built into the OS.
 */

import SunmiPrinter from 'react-native-sunmi-printer';
import { LocalVoucher, CURRENCY_SYMBOL, AppSettings } from '../types';

// Receipt width in characters for the Sunmi V2S 58mm printer
const LINE_WIDTH = 32;

function centerText(text: string): string {
  const pad = Math.max(0, Math.floor((LINE_WIDTH - text.length) / 2));
  return ' '.repeat(pad) + text;
}

function divider(): string {
  return '-'.repeat(LINE_WIDTH);
}

function twoColumn(left: string, right: string): string {
  const gap = LINE_WIDTH - left.length - right.length;
  if (gap <= 0) return `${left} ${right}`;
  return left + ' '.repeat(gap) + right;
}

export async function printVoucherReceipt(
  voucher: LocalVoucher,
  settings: AppSettings,
): Promise<void> {
  const symbol = CURRENCY_SYMBOL[voucher.currency];
  const createdDate = new Date(voucher.createdAt).toLocaleDateString('en-GB');
  const expiryDate = new Date(voucher.expiryDate).toLocaleDateString('en-GB');

  try {
    await SunmiPrinter.initPrinter();

    // Header
    await SunmiPrinter.setAlignment(1); // centre
    await SunmiPrinter.setFontSize(28);
    await SunmiPrinter.printText(settings.storeName || 'SatsVoucher');
    await SunmiPrinter.lineWrap(1);

    await SunmiPrinter.setFontSize(24);
    if (settings.receiptHeader) {
      await SunmiPrinter.printText(settings.receiptHeader);
      await SunmiPrinter.lineWrap(1);
    }

    await SunmiPrinter.printText(divider());
    await SunmiPrinter.lineWrap(1);

    // Amount — large and prominent
    await SunmiPrinter.setFontSize(36);
    await SunmiPrinter.printText(`${symbol}${voucher.amountFiat.toFixed(2)}`);
    await SunmiPrinter.lineWrap(1);

    await SunmiPrinter.setFontSize(24);
    await SunmiPrinter.printText(`${voucher.amountBtc.toFixed(8)} BTC`);
    await SunmiPrinter.lineWrap(1);

    await SunmiPrinter.setAlignment(0); // left
    await SunmiPrinter.printText(divider());
    await SunmiPrinter.lineWrap(1);

    // Details
    await SunmiPrinter.printText(twoColumn('Voucher ID:', voucher.id));
    await SunmiPrinter.lineWrap(1);
    await SunmiPrinter.printText(twoColumn('Issued:', createdDate));
    await SunmiPrinter.lineWrap(1);
    await SunmiPrinter.printText(twoColumn('Expires:', expiryDate));
    await SunmiPrinter.lineWrap(1);
    await SunmiPrinter.printText(twoColumn('Rate:', `${symbol}${voucher.btcPriceAtSale.toLocaleString()}/BTC`));
    await SunmiPrinter.lineWrap(1);

    await SunmiPrinter.printText(divider());
    await SunmiPrinter.lineWrap(1);

    // QR code — centred, 8 = module size, 1 = error correction level H
    await SunmiPrinter.setAlignment(1);
    await SunmiPrinter.printQRCode(voucher.lnurl, 8, 1);
    await SunmiPrinter.lineWrap(1);

    await SunmiPrinter.setFontSize(20);
    await SunmiPrinter.printText('Scan with a Lightning wallet to redeem');
    await SunmiPrinter.lineWrap(1);

    await SunmiPrinter.printText(divider());
    await SunmiPrinter.lineWrap(1);

    // Footer
    if (settings.receiptFooter) {
      await SunmiPrinter.setFontSize(20);
      await SunmiPrinter.printText(settings.receiptFooter);
      await SunmiPrinter.lineWrap(1);
    }

    // Feed and cut
    await SunmiPrinter.lineWrap(3);
    await SunmiPrinter.cutPaper();
  } catch (error: any) {
    throw new Error(`Print failed: ${error?.message ?? 'Unknown printer error'}`);
  }
}
