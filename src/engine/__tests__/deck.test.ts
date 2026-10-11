import { drawGame, emptyDeck, Deck } from '../deck';
import { ROTATION, MicrogameId } from '../microgames';
import { seededRng } from '../rng';

function drawMany(n: number, seed: number) {
  const rng = seededRng(seed);
  let deck: Deck = emptyDeck;
  const ids: MicrogameId[] = [];
  for (let i = 0; i < n; i++) {
    const d = drawGame(deck, rng);
    ids.push(d.id);
    deck = d.deck;
  }
  return ids;
}

describe('shuffle bag', () => {
  it('deals every game once before any repeats', () => {
    const ids = drawMany(ROTATION.length * 3, 7);
    for (let b = 0; b < 3; b++) {
      const bag = ids.slice(b * ROTATION.length, (b + 1) * ROTATION.length);
      expect(new Set(bag).size).toBe(ROTATION.length);
    }
  });

  it('never deals the same game twice in a row, across many seeds', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const ids = drawMany(60, seed);
      for (let i = 1; i < ids.length; i++) expect(ids[i]).not.toBe(ids[i - 1]);
    }
  });

  it('is repeatable for a seed', () => {
    expect(drawMany(25, 42)).toEqual(drawMany(25, 42));
  });
});
