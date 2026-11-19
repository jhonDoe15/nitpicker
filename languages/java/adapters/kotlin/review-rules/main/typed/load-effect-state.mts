import type { KotlinFile } from '../../typed/kotlin-fact-types.mts';

export type UnknownState = { kind: 'unknown' };
type StaticState = { kind: 'static'; type: string };
export type InstanceState = {
  kind: 'instance';
  type: string | undefined;
  via: string | undefined;
};
export type ChainState = UnknownState | StaticState | InstanceState;

export type EffectScope = {
  file: KotlinFile;
  declared: Set<string>;
  owner: string;
};

export type Root = { state: ChainState; used: number };
