import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { LocalVoucher, AppSettings, CURRENCY_SYMBOL } from '../types';
import { printVoucherReceipt } from '../services/printer';
import AppHeader from '../components/AppHeader';

interface Props {
  voucher: LocalVoucher;
  settings: AppSettings;
  onDone: () => void;
  onReprint: () => void;
}

export default function ConfirmScreen({ voucher, settings, onDone, onReprint }: Props) {
  const [printing, setPrinting] = useState(false);
  const [printed, setPrinted] = useState(false);

  const symbol = CURRENCY_SYMBOL[voucher.currency];
  const createdDate = new Date(voucher.createdAt).toLocaleDateString('en-GB');
  const expiryDate = new Date(voucher.expiryDate).toLocaleDateString('en-GB');

  const handlePrint = async () => {
    setPrinting(true);
    try {
      await printVoucherReceipt(voucher, settings);
      setPrinted(true);
    } catch (e: any) {
      Alert.alert('Print failed', e?.message ?? 'Please check the printer and try again.');
    } finally {
      setPrinting(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <AppHeader onBack={onDone} backLabel="← New Sale" />

      {/* Status badge */}
      <View style={styles.statusRow}>
        <Text style={styles.title}>Voucher Created</Text>
        <View style={[styles.statusBadge, printed && styles.statusBadgePrinted]}>
          <Text style={[styles.statusText, printed && styles.statusTextPrinted]}>
            {printed ? 'Printed' : 'Ready to print'}
          </Text>
        </View>
      </View>

      {/* Amount */}
      <View style={styles.amountCard}>
        <Text style={styles.fiatAmount}>
          {symbol}{voucher.amountFiat.toFixed(2)}
        </Text>
        <Text style={styles.btcAmount}>{voucher.amountBtc.toFixed(8)} BTC</Text>
        <Text style={styles.rateText}>
          Rate: {symbol}{voucher.btcPriceAtSale.toLocaleString()}/BTC
        </Text>
      </View>

      {/* QR code preview */}
      <View style={styles.qrCard}>
        <QRCode
          value={voucher.lnurl}
          size={200}
          backgroundColor="#ffffff"
          color="#000000"
        />
        <Text style={styles.voucherId}>ID: {voucher.id}</Text>
      </View>

      {/* Details */}
      <View style={styles.detailsCard}>
        <Row label="Issued" value={createdDate} />
        <Row label="Expires" value={expiryDate} />
        <Row label="Validity" value={`${settings.expiryDays} days`} />
      </View>

      {/* Actions */}
      <TouchableOpacity
        style={[styles.printBtn, printing && styles.printBtnDisabled]}
        onPress={handlePrint}
        disabled={printing}
        activeOpacity={0.8}
      >
        {printing ? (
          <ActivityIndicator color="#0a0a0a" />
        ) : (
          <Text style={styles.printBtnText}>{printed ? 'Reprint Receipt' : 'Print Receipt'}</Text>
        )}
      </TouchableOpacity>

      {printed && (
        <TouchableOpacity style={styles.doneBtn} onPress={onDone} activeOpacity={0.8}>
          <Text style={styles.doneBtnText}>New Sale</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  content: {
    padding: 16,
    gap: 12,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  title: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '700',
  },
  statusBadge: {
    backgroundColor: '#1a1a00',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#FFD000',
  },
  statusBadgePrinted: {
    backgroundColor: '#001a00',
    borderColor: '#00cc44',
  },
  statusText: {
    color: '#FFD000',
    fontSize: 12,
    fontWeight: '700',
  },
  statusTextPrinted: {
    color: '#00cc44',
  },
  amountCard: {
    backgroundColor: '#111',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#222',
  },
  fiatAmount: {
    color: '#FFD000',
    fontSize: 48,
    fontWeight: '200',
  },
  btcAmount: {
    color: '#aaa',
    fontSize: 16,
    marginTop: 4,
    fontWeight: '500',
  },
  rateText: {
    color: '#555',
    fontSize: 12,
    marginTop: 4,
  },
  qrCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    gap: 12,
  },
  voucherId: {
    color: '#333',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 2,
  },
  detailsCard: {
    backgroundColor: '#111',
    borderRadius: 16,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: '#222',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  rowLabel: {
    color: '#666',
    fontSize: 14,
  },
  rowValue: {
    color: '#ccc',
    fontSize: 14,
    fontWeight: '600',
  },
  printBtn: {
    backgroundColor: '#FFD000',
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
    marginTop: 4,
  },
  printBtnDisabled: {
    opacity: 0.5,
  },
  printBtnText: {
    color: '#0a0a0a',
    fontSize: 18,
    fontWeight: '800',
  },
  doneBtn: {
    backgroundColor: '#1a1a1a',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333',
  },
  doneBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
});
