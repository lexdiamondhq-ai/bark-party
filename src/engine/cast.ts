import { colors } from '../theme/tokens';

export type PupId = 'biscuit' | 'pepper' | 'nacho' | 'maple' | 'olive' | 'ziggy';
export type CoachId = 'leo' | 'maya' | 'alex' | 'hana';
export type WorldId = 'living' | 'kitchen' | 'backyard' | 'park' | 'bath' | 'disco';
export type PlayerShape = 'star' | 'heart' | 'drop' | 'diamond' | 'leaf' | 'bolt';

export interface Pup {
  id: PupId;
  name: string;
  breed: string;
  homeBow: string;
  size: number;
}

export const PUPS: readonly Pup[] = [
  { id: 'biscuit', name: 'Biscuit', breed: 'Golden Retriever', homeBow: colors.bubblegum, size: 1 },
  { id: 'pepper', name: 'Pepper', breed: 'Husky', homeBow: colors.poolTeal, size: 1 },
  { id: 'nacho', name: 'Nacho', breed: 'French Bulldog', homeBow: colors.grapeSoda, size: 1 },
  { id: 'maple', name: 'Maple', breed: 'Beagle', homeBow: colors.kiwi, size: 1 },
  { id: 'olive', name: 'Olive', breed: 'Black Lab', homeBow: colors.blueRaspberry, size: 1.1 },
  { id: 'ziggy', name: 'Ziggy', breed: 'German Shepherd', homeBow: colors.tomato, size: 1 },
];

export interface PlayerSlot {
  index: number; // 0-based; P1 is index 0
  color: string;
  /** Background for chips with Cocoa text. Only Grape Soda differs. */
  chipColor: string;
  shape: PlayerShape;
}

/** Player colors always come with a shape so color-blind players can follow every turn. */
export const PLAYER_SLOTS: readonly PlayerSlot[] = [
  { index: 0, color: colors.blueRaspberry, chipColor: colors.blueRaspberry, shape: 'star' },
  { index: 1, color: colors.bubblegum, chipColor: colors.bubblegum, shape: 'heart' },
  { index: 2, color: colors.poolTeal, chipColor: colors.poolTeal, shape: 'drop' },
  { index: 3, color: colors.grapeSoda, chipColor: colors.grapeSodaChip, shape: 'diamond' },
  { index: 4, color: colors.kiwi, chipColor: colors.kiwi, shape: 'leaf' },
  { index: 5, color: colors.tomato, chipColor: colors.tomato, shape: 'bolt' },
];

export interface World {
  id: WorldId;
  name: string;
  rimA: string;
  rimB: string;
  floorBounce: string;
  hatStripes: readonly [string, string];
  coach: CoachId;
}

// Coaches by world, from the guide: Maya runs the Park and Backyard, Alex the Living Room,
// Hana the Kitchen and Bath Time. Leo calls FASTER!, Hat on! and the Squirrel boss, so the
// disco world's default coach is Leo.
export const WORLDS: Readonly<Record<WorldId, World>> = {
  living: { id: 'living', name: 'Living Room · Golden hour', rimA: '#FFD27A', rimB: '#FF5A8A', floorBounce: '#FFB020', hatStripes: ['#FFB020', '#FF5A8A'], coach: 'alex' },
  kitchen: { id: 'kitchen', name: 'Kitchen · Mint morning', rimA: '#7FF0D8', rimB: '#FFB48A', floorBounce: '#19C3B1', hatStripes: ['#19C3B1', '#FFB48A'], coach: 'hana' },
  backyard: { id: 'backyard', name: 'Backyard · Kiwi noon', rimA: '#C8FF7A', rimB: '#FFB020', floorBounce: '#8EDB3F', hatStripes: ['#8EDB3F', '#FFB020'], coach: 'maya' },
  park: { id: 'park', name: 'Park · Sunset fetch', rimA: '#FF8A5B', rimB: '#FFC46B', floorBounce: '#FF5A36', hatStripes: ['#FF5A36', '#7B5CFF'], coach: 'maya' },
  bath: { id: 'bath', name: 'Bath Time · Bubbles', rimA: '#7FD6FF', rimB: '#FF9AC0', floorBounce: '#5AC8FA', hatStripes: ['#48A6FF', '#FF9AC0'], coach: 'hana' },
  disco: { id: 'disco', name: 'Party Night · Disco', rimA: '#B79CFF', rimB: '#FF5A8A', floorBounce: '#7B5CFF', hatStripes: ['#FFB020', '#7B5CFF'], coach: 'leo' },
};

export const COACHES: Readonly<Record<CoachId, { id: CoachId; name: string }>> = {
  leo: { id: 'leo', name: 'Leo' },
  maya: { id: 'maya', name: 'Maya' },
  alex: { id: 'alex', name: 'Alex' },
  hana: { id: 'hana', name: 'Hana' },
};
