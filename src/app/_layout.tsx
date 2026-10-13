// Per-weight imports so only the four faces we use ship in the app.
import { BagelFatOne_400Regular } from '@expo-google-fonts/bagel-fat-one/400Regular';
import { BricolageGrotesque_500Medium } from '@expo-google-fonts/bricolage-grotesque/500Medium';
import { BricolageGrotesque_700Bold } from '@expo-google-fonts/bricolage-grotesque/700Bold';
import { BricolageGrotesque_800ExtraBold } from '@expo-google-fonts/bricolage-grotesque/800ExtraBold';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { colors } from '../theme/tokens';

export default function RootLayout() {
  const [loaded] = useFonts({
    BagelFatOne_400Regular,
    BricolageGrotesque_500Medium,
    BricolageGrotesque_700Bold,
    BricolageGrotesque_800ExtraBold,
  });
  if (!loaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.velvetNight }}>
      <StatusBar style="light" />
      {/* No swipe-back: a left-edge swipe must never pop a level mid-run or reveal a stale passport. */}
      <Stack screenOptions={{ headerShown: false, gestureEnabled: false, contentStyle: { backgroundColor: colors.velvetNight } }} />
    </GestureHandlerRootView>
  );
}
