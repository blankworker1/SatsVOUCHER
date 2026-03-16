import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  StatusBar,
} from 'react-native';
import { AppSettings, CURRENCY_SYMBOL, LocalVoucher } from '../types';
import { fiatToBtc } from '../services/btcPrice';
import { createVoucher } from '../services/worker';
import { saveVoucher } from '../services/storage';
import AppHeader from '../components/AppHeader';

interface Props {
  settings: AppSettings;
  btcPrice: number | null;
  priceError: string | null;
  onVoucherCreated: (voucher: LocalVoucher) => void;
  onOpenSettings: () => void;
  onOpenHistory: () => void;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'];

export default function SaleScreen({
  settings,
  btcPrice,
  priceError,
  onVoucherCreated,
  onOpenSettings,
  onOpenHistory,
}: Props) {
  const [display, setDisplay] = useState('0.00');
  const [creating, setCreating] = useState(false);

  const symbol = CURRENCY_SYMBOL[settings.currency];

  // Cash-register digit shifting
  const handleKey = useCallback((key: string) => {
    setDisplay(prev => {
      let digits = prev.replace('.', '').replace(/^0+/, '');
      if (key === '⌫') {
        digits = digits.slice(0, -1);
      } else if (key === '.') {
        return prev; // decimal always implied
      } else {
        if (digits.length >= 8) return prev;
        digits = digits + key;
      }
      if (digits.length === 0) return '0.00';
      if (digits.length === 1) return '0.0' + digits;
      if (digits.length === 2) return '0.' + digits;
      return digits.slice(0, -2) + '.' + digits.slice(-2);
    });
  }, []);

  const amount = parseFloat(display);
  const btcAmount = btcPrice && amount > 0 ? fiatToBtc(amount, btcPrice) : null;

  const isAmountValid =
    amount >= settings.minAmountFiat && amount <= settings.maxAmountFiat;

  const handleCreate = async () => {
    if (!btcPrice) {
      Alert.alert('No price data', 'BTC price is unavailable. Please check your connection.');
      return;
    }
    if (!isAmountValid) {
      Alert.alert(
        'Invalid amount',
        `Amount must be between ${symbol}${settings.minAmountFiat.toFixed(2)} and ${symbol}${settings.maxAmountFiat.toFixed(2)}.`,
      );
      return;
    }

    setCreating(true);
    try {
      const amountBtc = fiatToBtc(amount, btcPrice);

      const result = await createVoucher(
        {
          amountBtc,
          amountFiat: amount,
          currency: settings.currency,
          expiryDays: settings.expiryDays,
        },
        settings,
      );

      const voucher: LocalVoucher = {
        id: result.id,
        lnurl: result.lnurl,
        amountFiat: amount,
        amountBtc,
        currency: settings.currency,
        btcPriceAtSale: btcPrice,
        createdAt: result.createdAt,
        expiryDate: result.expiryDate,
        status: 'active',
      };

      await saveVoucher(voucher);
      setDisplay('0.00');
      onVoucherCreated(voucher);
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Failed to create voucher. Please try again.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0a0a0a" />

      <AppHeader
        onHistory={onOpenHistory}
        onSettings={onOpenSettings}
      />

      {/* Amount display */}
      <View style={styles.displayArea}>
        <Text style={styles.currencySymbol}>{symbol}</Text>
        <Text style={styles.amount}>{display}</Text>
      </View>

      {/* BTC equivalent */}
      <View style={styles.btcRow}>
        {priceError ? (
          <Text style={styles.priceError}>Price unavailable — {priceError}</Text>
        ) : btcAmount ? (
          <Text style={styles.btcAmount}>
            {btcAmount.toFixed(8)} BTC
            <Text style={styles.btcRate}>  @  {symbol}{btcPrice?.toLocaleString()}/BTC</Text>
          </Text>
        ) : (
          <Text style={styles.btcPlaceholder}>Enter amount</Text>
        )}
      </View>

      {/* Keypad */}
      <View style={styles.keypad}>
        {KEYS.map(key => (
          <TouchableOpacity
            key={key}
            style={[styles.key, key === '⌫' && styles.keyBackspace]}
            onPress={() => handleKey(key)}
            activeOpacity={0.7}
          >
            <Text style={[styles.keyText, key === '⌫' && styles.keyBackspaceText]}>
              {key}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Print button */}
      <TouchableOpacity
        style={[
          styles.printBtn,
          (!isAmountValid || !btcPrice || creating) && styles.printBtnDisabled,
        ]}
        onPress={handleCreate}
        disabled={!isAmountValid || !btcPrice || creating}
        activeOpacity={0.8}
      >
        {creating ? (
          <ActivityIndicator color="#0a0a0a" />
        ) : (
          <Text style={styles.printBtnText}>Print Voucher</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  displayArea: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingVertical: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  currencySymbol: {
    color: '#FFD000',
    fontSize: 36,
    fontWeight: '300',
    marginBottom: 6,
    marginRight: 4,
  },
  amount: {
    color: '#ffffff',
    fontSize: 64,
    fontWeight: '200',
    letterSpacing: -2,
  },
  btcRow: {
    alignItems: 'center',
    paddingVertical: 12,
    minHeight: 44,
  },
  btcAmount: {
    color: '#aaaaaa',
    fontSize: 15,
    fontWeight: '500',
  },
  btcRate: {
    color: '#555',
    fontSize: 13,
    fontWeight: '400',
  },
  btcPlaceholder: {
    color: '#333',
    fontSize: 15,
  },
  priceError: {
    color: '#ff4444',
    fontSize: 13,
  },
  keypad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginVertical: 8,
  },
  key: {
    width: '30%',
    aspectRatio: 1.8,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  keyBackspace: {
    backgroundColor: '#1a0000',
    borderColor: '#3a1a1a',
  },
  keyText: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '400',
  },
  keyBackspaceText: {
    color: '#ff6666',
    fontSize: 20,
  },
  printBtn: {
    backgroundColor: '#FFD000',
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
    marginTop: 8,
  },
  printBtnDisabled: {
    backgroundColor: '#2a2a00',
  },
  printBtnText: {
    color: '#0a0a0a',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});
