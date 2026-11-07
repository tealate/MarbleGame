export type AttackEffect = 'axe' | 'pickaxe' | 'shovel' | 'shell';
export type DefenseMaterial = 'dirt' | 'glass' | 'wood' | 'concrete';
export type EffectId = AttackEffect | DefenseMaterial;

/** Shared IDs, labels and colors for slots, marble outlines, projectiles and debug. */
export const effects = {
  axe: { kind: 'attack', label: '斧', color: 0xff7777 },
  pickaxe: { kind: 'attack', label: 'つるはし', color: 0xc38aff },
  shovel: { kind: 'attack', label: 'シャベル', color: 0xa9e84b },
  shell: { kind: 'attack', label: '砲弾', color: 0xffce45 },
  dirt: { kind: 'defense', label: '土', color: 0xc08b65 },
  glass: { kind: 'defense', label: 'ガラス', color: 0x79dcf1 },
  wood: { kind: 'defense', label: '木', color: 0xe5a33d },
  concrete: { kind: 'defense', label: 'コンクリート', color: 0x9babb7 },
} as const;

export function isEffectId(id: string | undefined): id is EffectId {
  return id !== undefined && Object.prototype.hasOwnProperty.call(effects, id);
}
export function isDefenseEffect(id: EffectId): id is DefenseMaterial {
  return effects[id].kind === 'defense';
}
