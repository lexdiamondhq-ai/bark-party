// Squirrel gang art for story panels, drawn by tools/gen_sprites.js and tools/render_sprites.js.
export const STORY_SPRITES: Partial<Record<'boss' | 'gang' | 'cake' | 'cage', number>> = {
  boss: require('../../assets/game/sprites/boss_idle_0.png'),
  gang: require('../../assets/game/sprites/squirrel_run_1.png'),
  cake: require('../../assets/game/sprites/cake.png'),
  cage: require('../../assets/game/sprites/cage_closed.png'),
};
