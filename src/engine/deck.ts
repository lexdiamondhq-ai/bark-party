import { MicrogameId, ROTATION } from './microgames';
import { Rng, shuffled } from './rng';

/** A shuffle bag: every microgame once before any repeats, and never the same one twice in a row. */
export interface Deck {
  readonly bag: readonly MicrogameId[];
  readonly lastId: MicrogameId | null;
}

export const emptyDeck: Deck = { bag: [], lastId: null };

export function drawGame(deck: Deck, rng: Rng, pool: readonly MicrogameId[] = ROTATION): { id: MicrogameId; deck: Deck } {
  let bag = deck.bag.slice();
  if (bag.length === 0) {
    bag = shuffled(pool, rng);
    if (bag.length > 1 && bag[0] === deck.lastId) bag.push(bag.shift()!);
  }
  const id = bag.shift()!;
  return { id, deck: { bag, lastId: id } };
}
