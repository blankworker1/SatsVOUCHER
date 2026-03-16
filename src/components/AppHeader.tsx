import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Svg, { Rect, Circle, Polygon } from 'react-native-svg';

interface Props {
  // Optional right-side action buttons
  onHistory?: () => void;
  onSettings?: () => void;
  // For inner screens — show a back arrow instead
  onBack?: () => void;
  backLabel?: string;
  // Optional right-side label (e.g. "Save")
  rightAction?: { label: string; onPress: () => void };
}

export function Logo() {
  return (
    <Svg viewBox="0 0 500 500" width={34} height={34}>
      <Rect x="0" y="0" width="500" height="500" rx="80" ry="80" fill="#FFD000" />
      <Circle cx="250" cy="250" r="190" fill="#C8C8C8" stroke="#0D0D0D" strokeWidth="12" />
      <Polygon
        points="285,30 175,270 245,270 215,470 325,230 255,230"
        fill="#FFD000"
        stroke="#0D0D0D"
        strokeWidth="10"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function AppTitle() {
  return (
    <View style={styles.titleRow}>
      <Text style={styles.titleSats}>Sats </Text>
      <Text style={styles.titleVoucher}>VOUCHER</Text>
    </View>
  );
}

export default function AppHeader({ onHistory, onSettings, onBack, backLabel = '← Back', rightAction }: Props) {
  return (
    <View style={styles.header}>
      {/* Left side */}
      {onBack ? (
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backBtnText}>{backLabel}</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.logoRow}>
          <Logo />
          <AppTitle />
        </View>
      )}

      {/* Right side */}
      <View style={styles.actions}>
        {onHistory && (
          <TouchableOpacity onPress={onHistory} style={styles.headerBtn}>
            <Text style={styles.headerBtnText}>History</Text>
          </TouchableOpacity>
        )}
        {onSettings && (
          <TouchableOpacity onPress={onSettings} style={styles.headerBtn}>
            <Text style={styles.headerBtnText}>Settings</Text>
          </TouchableOpacity>
        )}
        {rightAction && (
          <TouchableOpacity onPress={rightAction.onPress} style={styles.saveBtn}>
            <Text style={styles.saveBtnText}>{rightAction.label}</Text>
          </TouchableOpacity>
        )}
        {/* Spacer so back-only headers stay balanced */}
        {onBack && !rightAction && <View style={styles.spacer} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#232323',
    flexShrink: 0,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  titleSats: {
    fontFamily: 'Barlow-CondensedBlack', // set in Android font config
    fontSize: 17,
    fontWeight: '900',
    color: '#FFD000',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  titleVoucher: {
    fontFamily: 'Barlow-Condensed',
    fontSize: 17,
    fontWeight: '300',
    color: '#ffffff',
    letterSpacing: 2.2,
    textTransform: 'uppercase',
  }, // white — do not change
  actions: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  headerBtn: {
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#232323',
  },
  headerBtnText: {
    color: '#666',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  saveBtn: {
    backgroundColor: '#FFD000',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  saveBtnText: {
    color: '#0a0a0a',
    fontWeight: '800',
    fontSize: 14,
  },
  backBtn: {
    paddingVertical: 4,
  },
  backBtnText: {
    color: '#FFD000',
    fontSize: 15,
    fontWeight: '600',
  },
  spacer: {
    width: 60,
  },
});
