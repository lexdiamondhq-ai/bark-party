import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { JellyButton } from '../components/JellyButton';
import { DISPLAY_MIN_PT, colors, fonts, typeScale } from '../theme/tokens';

export default function Home() {
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.hero}>
        <Text style={styles.logo} accessibilityRole="header">
          Bark Party
        </Text>
        <Text style={styles.tag}>Three-second dog games. One phone, up to six players.</Text>
      </View>
      <View style={styles.actions}>
        {/* The party lobby is the next build step; Party points at the rules preview until then. */}
        <JellyButton gold label="Party" onPress={() => router.push('/preview?mode=party')} />
        <JellyButton label="Solo" onPress={() => router.push('/preview?mode=solo')} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.velvetNight, justifyContent: 'space-between', padding: 24 },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  logo: {
    fontFamily: fonts.display,
    fontSize: Math.max(DISPLAY_MIN_PT, 64),
    lineHeight: 72,
    color: colors.biscuitGold,
    transform: [{ rotate: '-6deg' }],
  },
  tag: { fontFamily: fonts.body, fontSize: typeScale.body[0], lineHeight: typeScale.body[1], color: colors.marshmallow, textAlign: 'center' },
  actions: { alignItems: 'center', gap: 16, paddingBottom: 24 },
});
