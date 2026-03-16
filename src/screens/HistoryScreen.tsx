import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { LocalVoucher, AppSettings, CURRENCY_SYMBOL, VoucherStatus } from '../types';
import { getRecentVouchers, updateVoucher } from '../services/storage';
import { fetchVoucherStatus } from '../services/worker';
import { printVoucherReceipt } from '../services/printer';
import AppHeader from '../components/AppHeader';

interface Props {
  settings: AppSettings;
  onBack: () => void;
}

const STATUS_COLOR: Record<VoucherStatus, string> = {
  active: '#00cc44',
  claimed: '#888888',
  expired: '#ff4444',
};

const STATUS_LABEL: Record<VoucherStatus, string> = {
  active: 'Active',
  claimed: 'Redeemed',
  expired: 'Expired',
};

export default function HistoryScreen({ settings, onBack }: Props) {
  const [vouchers, setVouchers] = useState<LocalVoucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [checkingId, setCheckingId] = useState<string | null>(null);
  const [reprintingId, setReprintingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const list = await getRecentVouchers(50);
    setVouchers(list);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleRefresh = () => {
    setRefreshing(true);
    load();
  };

  const handleCheckStatus = async (voucher: LocalVoucher) => {
    setCheckingId(voucher.id);
    try {
      const result = await fetchVoucherStatus(voucher.id, settings);
      const updated: LocalVoucher = {
        ...voucher,
        status: result.status,
        checkedAt: new Date().toISOString(),
      };
      await updateVoucher(updated);
      setVouchers(prev => prev.map(v => v.id === voucher.id ? updated : v));

      Alert.alert(
        `Voucher ${voucher.id}`,
        `Status: ${STATUS_LABEL[result.status]}${result.claimedAt ? `\nRedeemed: ${new Date(result.claimedAt).toLocaleString('en-GB')}` : ''}`,
      );
    } catch (e: any) {
      Alert.alert('Check failed', e?.message ?? 'Could not reach server');
    } finally {
      setCheckingId(null);
    }
  };

  const handleReprint = async (voucher: LocalVoucher) => {
    setReprintingId(voucher.id);
    try {
      await printVoucherReceipt(voucher, settings);
    } catch (e: any) {
      Alert.alert('Print failed', e?.message ?? 'Please check the printer');
    } finally {
      setReprintingId(null);
    }
  };

  const renderVoucher = ({ item }: { item: LocalVoucher }) => {
    const symbol = CURRENCY_SYMBOL[item.currency];
    const date = new Date(item.createdAt).toLocaleDateString('en-GB');
    const isChecking = checkingId === item.id;
    const isReprinting = reprintingId === item.id;

    return (
      <View style={styles.voucherCard}>
        <View style={styles.voucherTop}>
          <View style={styles.voucherLeft}>
            <Text style={styles.voucherAmount}>
              {symbol}{item.amountFiat.toFixed(2)}
            </Text>
            <Text style={styles.voucherBtc}>{item.amountBtc.toFixed(8)} BTC</Text>
            <Text style={styles.voucherMeta}>{date} · {item.id}</Text>
          </View>
          <View style={[styles.statusBadge, { borderColor: STATUS_COLOR[item.status] }]}>
            <Text style={[styles.statusText, { color: STATUS_COLOR[item.status] }]}>
              {STATUS_LABEL[item.status]}
            </Text>
          </View>
        </View>

        <View style={styles.voucherActions}>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => handleCheckStatus(item)}
            disabled={isChecking || isReprinting}
          >
            {isChecking
              ? <ActivityIndicator size="small" color="#FFD000" />
              : <Text style={styles.actionBtnText}>Check status</Text>
            }
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, styles.actionBtnSecondary]}
            onPress={() => handleReprint(item)}
            disabled={isChecking || isReprinting}
          >
            {isReprinting
              ? <ActivityIndicator size="small" color="#888" />
              : <Text style={[styles.actionBtnText, styles.actionBtnTextSecondary]}>Reprint</Text>
            }
          </TouchableOpacity>
        </View>

        {item.checkedAt && (
          <Text style={styles.checkedAt}>
            Last checked: {new Date(item.checkedAt).toLocaleString('en-GB')}
          </Text>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <AppHeader onBack={onBack} backLabel="← Back" />

      {loading ? (
        <View style={styles.centred}>
          <ActivityIndicator color="#FFD000" />
        </View>
      ) : vouchers.length === 0 ? (
        <View style={styles.centred}>
          <Text style={styles.emptyText}>No vouchers yet</Text>
        </View>
      ) : (
        <FlatList
          data={vouchers}
          keyExtractor={v => v.id}
          renderItem={renderVoucher}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#FFD000"
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  list: {
    padding: 12,
    gap: 10,
  },
  voucherCard: {
    backgroundColor: '#111',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#222',
    gap: 10,
  },
  voucherTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  voucherLeft: {
    gap: 2,
  },
  voucherAmount: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '600',
  },
  voucherBtc: {
    color: '#888',
    fontSize: 13,
    fontWeight: '500',
  },
  voucherMeta: {
    color: '#444',
    fontSize: 12,
    marginTop: 2,
  },
  statusBadge: {
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
  },
  voucherActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    flex: 1,
    backgroundColor: '#1a1a00',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FFD000',
    minHeight: 38,
    justifyContent: 'center',
  },
  actionBtnSecondary: {
    backgroundColor: '#1a1a1a',
    borderColor: '#333',
  },
  actionBtnText: {
    color: '#FFD000',
    fontSize: 13,
    fontWeight: '700',
  },
  actionBtnTextSecondary: {
    color: '#888',
  },
  checkedAt: {
    color: '#333',
    fontSize: 11,
  },
});
