// Look directions for the chapter map and shop. Three moving sketches; Alex picks one, the others go.
import { router } from 'expo-router';
import { ImageBackground, Pressable, StyleSheet, Text, View } from 'react-native';

import { ROOMS } from '../../game/art';
import { playSfx } from '../../game/audio';
import { colors, fonts } from '../../theme/tokens';

const DIRECTIONS = [
  { href: '/directions/party-prep', name: 'Party Prep', blurb: 'The map is the party room filling up. Bones buy party gear you can see.' },
  { href: '/directions/treat-jar', name: 'Treat Jar', blurb: 'Bones fill a jar. Treats are upgrades the pup eats. Chapters sit below.' },
  { href: '/directions/passport', name: 'Pup Passport', blurb: 'Every chapter is a stamp in a passport. Upgrades are stickers on the collar.' },
] as const;

export default function Directions() {
  return (
    <ImageBackground source={ROOMS.room_yard} style={styles.root} resizeMode="cover" imageStyle={{ width: '100%', height: '100%' }}>
      <View style={styles.scrim} />
      <Text style={styles.title}>Pick a look</Text>
      <View style={styles.row}>
        {DIRECTIONS.map((d) => (
          <Pressable
            key={d.href}
            style={styles.card}
            onPress={() => {
              playSfx('button');
              router.push(d.href);
            }}
          >
            <Text style={styles.name}>{d.name}</Text>
            <Text style={styles.blurb}>{d.blurb}</Text>
          </Pressable>
        ))}
      </View>
      <Pressable style={styles.back} onPress={() => router.back()} hitSlop={10}>
        <Text style={styles.backText}>Back</Text>
      </Pressable>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 18 },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(20,10,31,0.6)' },
  title: { fontFamily: fonts.display, fontSize: 44, color: colors.biscuitGold, transform: [{ rotate: '-6deg' }], textShadowColor: colors.cocoa, textShadowOffset: { width: 0, height: 4 }, textShadowRadius: 0 },
  row: { flexDirection: 'row', gap: 14, paddingHorizontal: 20 },
  card: { flex: 1, maxWidth: 260, backgroundColor: colors.marshmallow, borderColor: colors.cocoa, borderWidth: 3, borderBottomWidth: 7, borderRadius: 22, padding: 16, gap: 6 },
  name: { fontFamily: fonts.display, fontSize: 26, color: colors.cocoa },
  blurb: { fontFamily: fonts.body, fontSize: 15, lineHeight: 20, color: colors.cocoa },
  back: { position: 'absolute', top: 14, left: 18, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, backgroundColor: 'rgba(26,15,11,0.5)' },
  backText: { fontFamily: fonts.bodyHeavy, fontSize: 15, color: colors.marshmallow },
});
