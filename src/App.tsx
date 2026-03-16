import React, { useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useSettings } from './hooks/useSettings';
import { useBtcPrice } from './hooks/useBtcPrice';
import { LocalVoucher } from './types';
import SaleScreen from './screens/SaleScreen';
import ConfirmScreen from './screens/ConfirmScreen';
import HistoryScreen from './screens/HistoryScreen';
import SettingsScreen from './screens/SettingsScreen';

type Screen = 'sale' | 'confirm' | 'history' | 'settings';

export default function App() {
  const { settings, loading, update, configured } = useSettings();
  const { price: btcPrice, error: priceError } = useBtcPrice(settings);
  const [screen, setScreen] = useState<Screen>('sale');
  const [currentVoucher, setCurrentVoucher] = useState<LocalVoucher | null>(null);

  if (loading || !settings) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#FFD000" />
      </View>
    );
  }

  // Force settings screen if not configured
  if (!configured && screen !== 'settings') {
    return (
      <SettingsScreen
        settings={settings}
        onSave={update}
        onBack={() => {}} // no back until configured
        requirePin={false}
      />
    );
  }

  switch (screen) {
    case 'confirm':
      if (!currentVoucher) { setScreen('sale'); return null; }
      return (
        <ConfirmScreen
          voucher={currentVoucher}
          settings={settings}
          onDone={() => { setCurrentVoucher(null); setScreen('sale'); }}
          onReprint={() => {}}
        />
      );

    case 'history':
      return (
        <HistoryScreen
          settings={settings}
          onBack={() => setScreen('sale')}
        />
      );

    case 'settings':
      return (
        <SettingsScreen
          settings={settings}
          onSave={update}
          onBack={() => setScreen('sale')}
          requirePin={!!settings.settingsPin}
        />
      );

    default:
      return (
        <SaleScreen
          settings={settings}
          btcPrice={btcPrice}
          priceError={priceError}
          onVoucherCreated={voucher => {
            setCurrentVoucher(voucher);
            setScreen('confirm');
          }}
          onOpenSettings={() => setScreen('settings')}
          onOpenHistory={() => setScreen('history')}
        />
      );
  }
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
