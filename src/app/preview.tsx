import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Balls } from '../components/Balls';
import { CommandCard } from '../components/CommandCard';
import { JellyButton } from '../components/JellyButton';
import {
  PARTY_BALLS,
  PLAYER_SLOTS,
  SOLO_BALLS,
  addPlayer,
  emptyLobby,
  planPartyTurn,
  planSoloRound,
  resolvePartyTurn,
  resolveSoloRound,
  standings,
  startParty,
  startSolo,
} from '../engine';
import type { PartyState, RoundPlan, SoloState } from '../engine';
import { colors, fonts, typeScale } from '../theme/tokens';

type Run = { game: SoloState | PartyState; plan: RoundPlan | null };

const rng = Math.random;

function newRun(mode: 'solo' | 'party'): Run {
  const game =
    mode === 'solo' ? startSolo() : startParty(['Alex', 'Sam', 'Kai'].reduce((l, n) => addPlayer(l, n), emptyLobby));
  return next(game);
}

function next(game: SoloState | PartyState): Run {
  if (game.over) return { game, plan: null };
  const r = game.mode === 'solo' ? planSoloRound(game, rng) : planPartyTurn(game, rng);
  return { game: r.state, plan: r.plan };
}

/**
 * Rules preview: walks the real game engine round by round with "Nailed it" and "Missed"
 * standing in for the microgames, which come next. Not a shipping screen.
 */
export default function Preview() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const runMode = mode === 'party' ? 'party' : 'solo';
  const [run, setRun] = useState<Run>(() => newRun(runMode));
  const { game, plan } = run;

  const resolve = (won: boolean) => {
    if (!plan) return;
    Haptics.notificationAsync(won ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error).catch(() => {});
    const resolved = game.mode === 'solo' ? resolveSoloRound(game, plan, won) : resolvePartyTurn(game, plan, won);
    setRun(next(resolved));
  };

  const player = game.mode === 'party' && plan ? game.players.find((p) => p.id === plan.playerId) : undefined;
  const slot = player ? PLAYER_SLOTS[player.slot] : undefined;
  const ranked = useMemo(() => (game.mode === 'party' && game.over ? standings(game) : []), [game]);

  return (
    <SafeAreaView style={[styles.screen, slot && { backgroundColor: slot.color }]}>
      <View style={styles.hud}>
        <Text style={[styles.label, slot && styles.onCandy]}>
          {game.mode === 'solo' ? `Round ${game.round} · ${game.score} cleared` : `Turn ${game.turn}`}
          {plan ? ` · ${plan.speed.toFixed(2)}x · ${plan.phases.playMs} ms` : ''}
        </Text>
        <Balls left={game.mode === 'solo' ? game.balls : player?.balls ?? 0} max={game.mode === 'solo' ? SOLO_BALLS : PARTY_BALLS} />
      </View>

      {plan ? (
        <View style={styles.middle}>
          {player && slot && (
            <Text style={[styles.turn, styles.onCandy]}>
              {player.name}&apos;s turn ({slot.shape})
            </Text>
          )}
          {plan.speedUp && <Text style={styles.faster}>FASTER!</Text>}
          <CommandCard plan={plan} onCandy={!!slot} />
        </View>
      ) : (
        <View style={styles.middle}>
          <Text style={styles.title}>{game.mode === 'solo' ? `${game.score} cleared` : `${ranked[0]?.name} wins!`}</Text>
          {game.mode === 'party' &&
            ranked.map((p, i) => (
              <Text key={p.id} style={styles.label}>
                {i + 1}. {p.name}, {p.wins} won
              </Text>
            ))}
        </View>
      )}

      <View style={styles.actions}>
        {plan ? (
          <>
            <JellyButton gold label="Nailed it" onPress={() => resolve(true)} />
            <JellyButton label="Missed" onCandy={!!slot} onPress={() => resolve(false)} />
          </>
        ) : (
          <>
            <JellyButton gold label="Play again" onPress={() => setRun(newRun(runMode))} />
            <JellyButton label="Home" onPress={() => router.back()} />
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.velvetNight, padding: 24 },
  hud: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontFamily: fonts.bodyBold, fontSize: typeScale.label[0], lineHeight: typeScale.label[1], color: colors.marshmallow },
  onCandy: { color: colors.cocoa },
  middle: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  turn: { fontFamily: fonts.bodyHeavy, fontSize: typeScale.headline[0], lineHeight: typeScale.headline[1] },
  faster: { fontFamily: fonts.display, fontSize: typeScale.title[0], lineHeight: typeScale.title[1] + 8, color: colors.tomato },
  title: { fontFamily: fonts.display, fontSize: typeScale.title[0], lineHeight: typeScale.title[1] + 8, color: colors.biscuitGold },
  actions: { alignItems: 'center', gap: 16, paddingBottom: 24 },
});
