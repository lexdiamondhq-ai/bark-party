import type { CoachId } from './level/types';
import type { DogId } from './sprites';

/** The hero. The Dog Better pup; rename here if the pup has an official name. */
export const HERO_NAME = 'Pup';
/** Chapter 1's boss; later chapters name theirs in their LevelDef. */
export const BOSS_NAME = 'Big Nutsy';

export const DOG_NAMES: Record<DogId, string> = {
  golden: 'Biscuit',
  husky: 'Pepper',
  frenchie: 'Nacho',
  beagle: 'Maple',
  lab: 'Olive',
  shepherd: 'Ziggy',
  collie: 'Scout',
  dachshund: 'Noodle',
  poodle: 'Bijou',
  rottweiler: 'Tank',
};

export const COACH_NAMES: Record<CoachId, string> = { leo: 'Leo', maya: 'Maya', alex: 'Alex', hana: 'Hana' };

/** Who is on stage in a story panel. */
export type Actor =
  | { kind: 'coach'; id: CoachId }
  | { kind: 'dog'; id: DogId }
  | { kind: 'pup'; pose: 'walk' | 'bark' | 'sit' | 'down' }
  | { kind: 'boss' }
  | { kind: 'gang' }
  | { kind: 'cake' }
  | { kind: 'cage'; dog: DogId };

export interface StoryPanel {
  speaker: string;
  text: string;
  /** Who stands on the left and right. */
  left?: Actor;
  right?: Actor;
  /** Shake the panel when it appears (the heist!). */
  slam?: boolean;
  /** Room picture behind the panel. */
  room: 'room_living' | 'room_cosy' | 'room_kitchen' | 'room_park' | 'room_yard';
  /** Lights out: the panel is drawn dark. */
  dark?: boolean;
}

export const CH1_INTRO: StoryPanel[] = [
  {
    room: 'room_living',
    speaker: 'Maya',
    text: "Big day! Biscuit's birthday Bark Party starts at sundown.",
    left: { kind: 'coach', id: 'maya' },
    right: { kind: 'dog', id: 'golden' },
  },
  {
    room: 'room_living',
    speaker: 'Leo',
    text: 'Balloons are up, the pups are here, and the cake is perfect.',
    left: { kind: 'coach', id: 'leo' },
    right: { kind: 'cake' },
  },
  {
    room: 'room_living',
    dark: true,
    speaker: '???',
    text: 'Then the lights went out...',
    right: { kind: 'gang' },
  },
  {
    room: 'room_living',
    slam: true,
    speaker: BOSS_NAME,
    text: 'Ha! The cake belongs to the Nutsy Gang now. And your little pups are coming too!',
    left: { kind: 'boss' },
    right: { kind: 'cage', dog: 'husky' },
  },
  {
    room: 'room_living',
    speaker: 'Hana',
    text: 'They locked Pepper, Maple and Nacho in crates! Somebody stop them!',
    left: { kind: 'coach', id: 'hana' },
    right: { kind: 'cage', dog: 'beagle' },
  },
  {
    room: 'room_living',
    speaker: 'Alex',
    text: `${HERO_NAME}, you're the fastest nose in the house. Free the pups and get that cake back!`,
    left: { kind: 'coach', id: 'alex' },
    right: { kind: 'pup', pose: 'bark' },
  },
];

/** Story scenes by chapter id. A chapter without an outro goes straight back to the map. */
export const STORIES: Record<string, { intro: StoryPanel[]; outro?: StoryPanel[] }> = {};

export const CH1_OUTRO: StoryPanel[] = [
  {
    room: 'room_living',
    speaker: BOSS_NAME,
    text: 'My cake! You have not seen the last of the Nutsy Gang!',
    left: { kind: 'boss' },
    right: { kind: 'pup', pose: 'bark' },
  },
  {
    room: 'room_living',
    speaker: 'Biscuit',
    text: "You found my cake! And everybody's here. Best. Birthday. Ever.",
    left: { kind: 'dog', id: 'golden' },
    right: { kind: 'cake' },
  },
  {
    room: 'room_kitchen',
    speaker: 'Leo',
    text: 'Wait... where are the party snacks? I hear chattering in the kitchen.',
    left: { kind: 'coach', id: 'leo' },
    right: { kind: 'gang' },
  },
];

STORIES.ch1 = { intro: CH1_INTRO, outro: CH1_OUTRO };

export const CH2_INTRO: StoryPanel[] = [
  {
    room: 'room_kitchen',
    speaker: 'Leo',
    text: 'The cake is back, but the kitchen is a mess. Where did the party snacks go?',
    left: { kind: 'coach', id: 'leo' },
    right: { kind: 'pup', pose: 'sit' },
  },
  {
    room: 'room_kitchen',
    slam: true,
    speaker: 'Chef Nutsy',
    text: "Snacks? MY snacks! And I've got three more pups up on the counter!",
    left: { kind: 'boss' },
    right: { kind: 'cage', dog: 'golden' },
  },
  {
    room: 'room_kitchen',
    speaker: 'Hana',
    text: 'Biscuit, Noodle and Scout! Pup, the stools are your stairs. Go get them!',
    left: { kind: 'coach', id: 'hana' },
    right: { kind: 'pup', pose: 'bark' },
  },
];

export const CH2_OUTRO: StoryPanel[] = [
  {
    room: 'room_kitchen',
    speaker: 'Chef Nutsy',
    text: 'Fine! Keep your crumbs. The Gang will see you at the park!',
    left: { kind: 'boss' },
    right: { kind: 'pup', pose: 'bark' },
  },
  {
    room: 'room_kitchen',
    speaker: 'Maya',
    text: `Snacks saved, pups in the wagon. ${HERO_NAME}, you are the hero of this party.`,
    left: { kind: 'coach', id: 'maya' },
    right: { kind: 'dog', id: 'golden' },
  },
];

STORIES.ch2 = { intro: CH2_INTRO, outro: CH2_OUTRO };

export const CH3_INTRO: StoryPanel[] = [
  {
    room: 'room_park',
    speaker: 'Maya',
    text: 'Picnic time! The whole party is moving to the park.',
    left: { kind: 'coach', id: 'maya' },
    right: { kind: 'dog', id: 'lab' },
  },
  {
    room: 'room_park',
    slam: true,
    speaker: 'Pine Nutsy',
    text: 'This park belongs to the Nutsy Gang! And these three pups are mine now!',
    left: { kind: 'boss' },
    right: { kind: 'cage', dog: 'shepherd' },
  },
  {
    room: 'room_park',
    speaker: 'Leo',
    text: `Olive, Ziggy and Bijou! ${HERO_NAME}, hop the benches and picnic tables. Go get them!`,
    left: { kind: 'coach', id: 'leo' },
    right: { kind: 'pup', pose: 'bark' },
  },
];

export const CH3_OUTRO: StoryPanel[] = [
  {
    room: 'room_park',
    speaker: 'Pine Nutsy',
    text: 'My park! Fine, keep it. But the Gang always gets the last nut. See you in the yard!',
    left: { kind: 'boss' },
    right: { kind: 'pup', pose: 'bark' },
  },
  {
    room: 'room_park',
    speaker: 'Hana',
    text: `Every pup is safe and the picnic is saved. ${HERO_NAME}, take a bow!`,
    left: { kind: 'coach', id: 'hana' },
    right: { kind: 'dog', id: 'poodle' },
  },
];

STORIES.ch3 = { intro: CH3_INTRO, outro: CH3_OUTRO };
