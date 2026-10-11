import { WORLDS } from '../cast';
import { COMMAND_RULE_EXCEPTIONS, isValidCommand, MICROGAMES, ROTATION } from '../microgames';

describe('microgame catalog', () => {
  it('has the ten prototype games in rotation plus the boss outside it', () => {
    expect(ROTATION).toHaveLength(10);
    expect(ROTATION).not.toContain('squirrel');
    expect(MICROGAMES.squirrel.boss).toBe(true);
  });

  it.each(Object.values(MICROGAMES).filter((g) => !COMMAND_RULE_EXCEPTIONS.includes(g.id)))(
    '$command follows the command rule (1 to 2 words, 11 chars max, ends in "!")',
    (g) => expect(isValidCommand(g.command)).toBe(true),
  );

  it('knows the one exception breaks the rule', () => {
    expect(isValidCommand(MICROGAMES.coachSays.command)).toBe(false);
  });

  it('rejects commands that break the rule', () => {
    expect(isValidCommand('Roll over now!')).toBe(false); // three words
    expect(isValidCommand('Supercalifr!')).toBe(false); // 12 chars
    expect(isValidCommand('Sit')).toBe(false); // no "!"
  });

  it('puts each game in the world the guide lists, with that world or the named coach', () => {
    expect(MICROGAMES.catch.world).toBe('park');
    expect(MICROGAMES.dodge.world).toBe('bath');
    expect(MICROGAMES.sniff.world).toBe('kitchen');
    expect(MICROGAMES.fetch.world).toBe('backyard');
    expect(MICROGAMES.hatOn.world).toBe('disco');
    expect(MICROGAMES.coachSays.coach).toBe('alex');
    expect(MICROGAMES.hatOn.coach).toBe('leo');
    expect(MICROGAMES.squirrel.coach).toBe('leo');
    expect(MICROGAMES.wipe.coach).toBe('hana');
    expect(MICROGAMES.catch.coach).toBe(WORLDS.park.coach);
  });

  it('only Dodge! and Don\'t bark! are won by lasting to the end', () => {
    const survive = Object.values(MICROGAMES).filter((g) => g.winsOnTimeout).map((g) => g.id).sort();
    expect(survive).toEqual(['dodge', 'dontBark']);
  });
});
