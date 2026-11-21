import type { FactDefinition } from './fact-types.mts';

export type ReuseDefinition = Omit<
  FactDefinition,
  'exportNames' | 'text' | 'key' | 'size' | 'lines' | 'literal' | 'entry'
> & {
  readonly exportNames: readonly string[];
  readonly text: string;
  readonly key: string;
  readonly size: number;
  readonly lines: number;
  readonly literal: boolean;
  readonly entry: boolean;
  readonly used: boolean;
};

export type ReuseModule = {
  readonly path: string;
  readonly packageRoot: string;
  readonly definitions: ReuseDefinition[];
};
