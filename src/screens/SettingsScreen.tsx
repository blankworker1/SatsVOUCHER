import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { AppSettings, Currency, PriceSource, DEFAULT_SETTINGS } from '../types';
import AppHeader from '../components/AppHeader';

interface Props {
  settings: AppSettings;
  onSave: (settings: AppSettings) => Promise<void>;
  onBack: () => void;
  requirePin: boolean;
}

const CURRENCIES: Currency[] = ['GBP', 'USD', 'EUR'];
const CURRENCY_NAMES: Record<Currency, string> = { GBP: '£ GBP', USD: '$ USD', EUR: '€ EUR' };

export default function SettingsScreen({ settings, onSave, onBack, requirePin }: Props) {
  const [pinEntry, setPinEntry] = useState('');
  const [unlocked, setUnlocked] = useState(!requirePin);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<AppSettings>({ ...settings });

  if (!unlocked) {
    return (
      <View style={styles.pinScreen}>
        <Text style={styles.pinTitle}>Enter Settings PIN</Text>
        <TextInput
          style={styles.pinInput}
          value={pinEntry}
          onChangeText={setPinEntry}
          keyboardType="number-pad"
          maxLength={4}
          secureTextEntry
          placeholder="····"
          placeholderTextColor="#333"
          autoFocus
        />
        <View style={styles.pinActions}>
          <TouchableOpacity style={styles.pinCancelBtn} onPress={onBack}>
            <Text style={styles.pinCancelText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.pinSubmitBtn}
            onPress={() => {
              if (pinEntry === settings.settingsPin) {
                setUnlocked(true);
                setPinEntry('');
              } else {
                Alert.alert('Incorrect PIN');
                setPinEntry('');
              }
            }}
          >
            <Text style={styles.pinSubmitText}>Unlock</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const set = (key: keyof AppSettings, value: any) =>
    setDraft(prev => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    if (!draft.workerUrl.trim()) { Alert.alert('Missing field', 'Worker URL is required'); return; }
    if (!draft.workerSecret.trim()) { Alert.alert('Missing field', 'Worker secret is required'); return; }
    if (!draft.blinkApiKey.trim()) { Alert.alert('Missing field', 'Blink API key is required'); return; }
    if (!draft.blinkWalletId.trim()) { Alert.alert('Missing field', 'Blink wallet ID is required'); return; }
    if (draft.settingsPin && !/^\d{4}$/.test(draft.settingsPin)) {
      Alert.alert('Invalid PIN', 'PIN must be exactly 4 digits'); return;
    }
    setSaving(true);
    try {
      await onSave(draft);
      Alert.alert('Saved', 'Settings saved successfully');
      onBack();
    } catch (e: any) {
      Alert.alert('Save failed', e?.message ?? 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <AppHeader
        onBack={onBack}
        backLabel="← Back"
        rightAction={{ label: saving ? 'Saving…' : 'Save', onPress: handleSave }}
      />

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

        <SectionHeader title="Lightning wallet" required />
        <Field label="Blink API key">
          <TextInput style={styles.input} value={draft.blinkApiKey}
            onChangeText={v => set('blinkApiKey', v)} placeholder="blink_api_key_..."
            placeholderTextColor="#333" autoCapitalize="none" autoCorrect={false} secureTextEntry />
        </Field>
        <Field label="Blink wallet ID">
          <TextInput style={styles.input} value={draft.blinkWalletId}
            onChangeText={v => set('blinkWalletId', v)} placeholder="wallet_id_..."
            placeholderTextColor="#333" autoCapitalize="none" autoCorrect={false} />
        </Field>

        <SectionHeader title="Cloudflare Worker" required />
        <Field label="Worker URL">
          <TextInput style={styles.input} value={draft.workerUrl}
            onChangeText={v => set('workerUrl', v.trim())}
            placeholder="https://satsvoucher.your-name.workers.dev"
            placeholderTextColor="#333" autoCapitalize="none" keyboardType="url" />
        </Field>
        <Field label="Worker secret">
          <TextInput style={styles.input} value={draft.workerSecret}
            onChangeText={v => set('workerSecret', v.trim())} placeholder="your-worker-secret"
            placeholderTextColor="#333" autoCapitalize="none" secureTextEntry />
        </Field>

        <SectionHeader title="Store" />
        <Field label="Store name">
          <TextInput style={styles.input} value={draft.storeName}
            onChangeText={v => set('storeName', v)} placeholder="My Store" placeholderTextColor="#333" />
        </Field>
        <Field label="Operator name">
          <TextInput style={styles.input} value={draft.operatorName}
            onChangeText={v => set('operatorName', v)} placeholder="Optional" placeholderTextColor="#333" />
        </Field>

        <SectionHeader title="Currency" />
        <View style={styles.segmentRow}>
          {CURRENCIES.map(c => (
            <TouchableOpacity key={c} style={[styles.segment, draft.currency === c && styles.segmentActive]}
              onPress={() => set('currency', c)}>
              <Text style={[styles.segmentText, draft.currency === c && styles.segmentTextActive]}>
                {CURRENCY_NAMES[c]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <SectionHeader title="Voucher rules" />
        <View style={styles.row}>
          <Field label="Min amount" style={styles.halfField}>
            <TextInput style={styles.input} value={String(draft.minAmountFiat)}
              onChangeText={v => set('minAmountFiat', parseFloat(v) || 0)} keyboardType="decimal-pad" />
          </Field>
          <Field label="Max amount" style={styles.halfField}>
            <TextInput style={styles.input} value={String(draft.maxAmountFiat)}
              onChangeText={v => set('maxAmountFiat', parseFloat(v) || 0)} keyboardType="decimal-pad" />
          </Field>
        </View>
        <Field label="Expiry (days)">
          <TextInput style={styles.input} value={String(draft.expiryDays)}
            onChangeText={v => set('expiryDays', parseInt(v) || 90)} keyboardType="number-pad" />
        </Field>

        <SectionHeader title="Receipt" />
        <Field label="Header line">
          <TextInput style={styles.input} value={draft.receiptHeader}
            onChangeText={v => set('receiptHeader', v)}
            placeholder="Thank you for your purchase" placeholderTextColor="#333" />
        </Field>
        <Field label="Footer line">
          <TextInput style={styles.input} value={draft.receiptFooter}
            onChangeText={v => set('receiptFooter', v)}
            placeholder="Non-refundable. Terms apply." placeholderTextColor="#333" />
        </Field>

        <SectionHeader title="BTC price" />
        <View style={styles.segmentRow}>
          {(['coingecko', 'manual'] as PriceSource[]).map(s => (
            <TouchableOpacity key={s} style={[styles.segment, draft.priceSource === s && styles.segmentActive]}
              onPress={() => set('priceSource', s)}>
              <Text style={[styles.segmentText, draft.priceSource === s && styles.segmentTextActive]}>
                {s === 'coingecko' ? 'Live (CoinGecko)' : 'Manual'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        {draft.priceSource === 'coingecko' && (
          <Field label="Refresh interval (minutes)">
            <TextInput style={styles.input} value={String(draft.priceRefreshMinutes)}
              onChangeText={v => set('priceRefreshMinutes', parseInt(v) || 5)} keyboardType="number-pad" />
          </Field>
        )}
        {draft.priceSource === 'manual' && (
          <Field label={`Manual BTC price (${draft.currency})`}>
            <TextInput style={styles.input}
              value={draft.manualBtcPrice > 0 ? String(draft.manualBtcPrice) : ''}
              onChangeText={v => set('manualBtcPrice', parseFloat(v) || 0)}
              keyboardType="decimal-pad" placeholder="e.g. 65000" placeholderTextColor="#333" />
          </Field>
        )}

        <SectionHeader title="Security" />
        <Field label="Settings PIN (4 digits — leave blank to disable)">
          <TextInput style={styles.input} value={draft.settingsPin}
            onChangeText={v => set('settingsPin', v.replace(/\D/g, '').slice(0, 4))}
            keyboardType="number-pad" maxLength={4} secureTextEntry
            placeholder="····" placeholderTextColor="#333" />
        </Field>

        <TouchableOpacity style={styles.resetBtn} onPress={() =>
          Alert.alert('Reset to defaults', 'Clears all settings except API keys and secrets.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Reset', style: 'destructive', onPress: () =>
              setDraft(prev => ({
                ...DEFAULT_SETTINGS,
                blinkApiKey: prev.blinkApiKey,
                blinkWalletId: prev.blinkWalletId,
                workerUrl: prev.workerUrl,
                workerSecret: prev.workerSecret,
              }))
            },
          ])
        }>
          <Text style={styles.resetBtnText}>Reset to defaults</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
          onPress={handleSave} disabled={saving}>
          <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Save settings'}</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function SectionHeader({ title, required }: { title: string; required?: boolean }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {required && <Text style={styles.requiredBadge}>required</Text>}
    </View>
  );
}

function Field({ label, children, style }: { label: string; children: React.ReactNode; style?: object }) {
  return (
    <View style={[styles.field, style]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  backBtn: { width: 60 },
  backBtnText: { color: '#FFD000', fontSize: 15, fontWeight: '600' },
  title: { color: '#ffffff', fontSize: 17, fontWeight: '700' },
  content: { padding: 16, gap: 10 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16, marginBottom: 4 },
  sectionTitle: { color: '#FFD000', fontSize: 12, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase' },
  requiredBadge: { color: '#FFD000', fontSize: 10, fontWeight: '600', backgroundColor: '#1a1a00',
    borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: '#FFD000', overflow: 'hidden' },
  field: { gap: 6 },
  halfField: { flex: 1 },
  fieldLabel: { color: '#666', fontSize: 12, fontWeight: '600' },
  input: { backgroundColor: '#111', borderRadius: 10, borderWidth: 1, borderColor: '#222',
    padding: 12, color: '#ffffff', fontSize: 14,
    fontFamily: Platform.OS === 'android' ? 'monospace' : 'Courier' },
  row: { flexDirection: 'row', gap: 10 },
  segmentRow: { flexDirection: 'row', backgroundColor: '#111', borderRadius: 10,
    borderWidth: 1, borderColor: '#222', overflow: 'hidden' },
  segment: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  segmentActive: { backgroundColor: '#FFD000' },
  segmentText: { color: '#666', fontSize: 13, fontWeight: '600' },
  segmentTextActive: { color: '#0a0a0a' },
  resetBtn: { marginTop: 16, paddingVertical: 14, borderRadius: 12,
    borderWidth: 1, borderColor: '#330000', alignItems: 'center' },
  resetBtnText: { color: '#ff4444', fontSize: 14, fontWeight: '600' },
  saveBtn: { backgroundColor: '#FFD000', borderRadius: 14, paddingVertical: 18, alignItems: 'center', marginTop: 8 },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: '#0a0a0a', fontSize: 18, fontWeight: '800' },
  pinScreen: { flex: 1, backgroundColor: '#0a0a0a', justifyContent: 'center',
    alignItems: 'center', padding: 32, gap: 24 },
  pinTitle: { color: '#ffffff', fontSize: 20, fontWeight: '700' },
  pinInput: { backgroundColor: '#111', borderRadius: 12, borderWidth: 1, borderColor: '#333',
    padding: 16, color: '#FFD000', fontSize: 32, letterSpacing: 12, textAlign: 'center', width: 180 },
  pinActions: { flexDirection: 'row', gap: 12 },
  pinCancelBtn: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: '#333' },
  pinCancelText: { color: '#666', fontSize: 15, fontWeight: '600' },
  pinSubmitBtn: { backgroundColor: '#FFD000', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 },
  pinSubmitText: { color: '#0a0a0a', fontSize: 15, fontWeight: '800' },
});
