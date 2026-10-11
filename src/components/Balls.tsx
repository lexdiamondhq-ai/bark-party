import { StyleSheet, View } from 'react-native';

import { colors } from '../theme/tokens';

/** Tennis balls are lives. Lost balls stay as empty rings so the count never jumps. */
export function Balls({ left, max }: { left: number; max: number }) {
  return (
    <View style={styles.row} accessibilityLabel={`${left} of ${max} balls left`}>
      {Array.from({ length: max }, (_, i) => (
        <View key={i} style={[styles.ball, i < left ? styles.full : styles.empty]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  ball: { width: 26, height: 26, borderRadius: 13, borderWidth: 2.5, borderColor: colors.cocoa },
  full: { backgroundColor: colors.kiwi },
  empty: { backgroundColor: 'transparent', borderColor: 'rgba(255,244,226,0.35)' },
});
