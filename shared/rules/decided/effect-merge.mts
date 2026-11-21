import type { Effects } from './typed/decided-types.mts';

type Known = { readonly names: ReadonlySet<string>; readonly readsMembers: boolean };

export const NO_EFFECTS: Effects = Object.freeze({
  writes: new Set<string>(),
  memberWrite: false,
  call: false,
  opaque: false,
});

export function mergedEffects(parts: readonly Effects[]): Effects {
  return {
    writes: new Set(parts.flatMap(({ writes }) => [...writes])),
    memberWrite: parts.some(({ memberWrite }) => memberWrite),
    call: parts.some(({ call }) => call),
    opaque: parts.some(({ opaque }) => opaque),
  };
}

function survives(
  known: Known,
  effects: Effects,
  {
    mutable,
    memberWritesReachNames,
  }: { mutable: ReadonlySet<string>; memberWritesReachNames: boolean },
): boolean {
  if (effects.opaque || [...known.names].some((name) => effects.writes.has(name))) {
    return false;
  }
  const reaches = effects.call || effects.memberWrite;
  if (reaches && known.readsMembers) {
    return false;
  }
  const changesNames = memberWritesReachNames ? reaches : effects.call;
  return !(changesNames && [...known.names].some((name) => mutable.has(name)));
}

function survivingFacts<Fact extends Known>(
  facts: readonly Fact[],
  effects: Effects,
  options: { mutable: ReadonlySet<string>; memberWritesReachNames: boolean },
): Fact[] {
  return facts.filter((known) => survives(known, effects, options));
}

export type AfterEffects = <Fact extends Known>(
  facts: readonly Fact[],
  effects: Effects,
  mutable: ReadonlySet<string>,
) => Fact[];

export function afterEffectsWith(memberWritesReachNames: boolean): AfterEffects {
  return (facts, effects, mutable) =>
    survivingFacts(facts, effects, { mutable, memberWritesReachNames });
}
