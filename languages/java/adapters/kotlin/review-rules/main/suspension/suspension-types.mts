import type { ItemScope } from '../locking/locking-types.mts';

export type ValueItem = {
  k: string;
  name: string;
  viaThis: boolean;
  receiver?: { kind: string; name?: string };
};

type LockStep = { lock: string };

export type WorkStep = {
  lock?: undefined;
  local?: string;
  assign?: string;
  operator?: string;
  value: ValueItem[];
  writes: string[];
};

export type UpdateStep = LockStep | WorkStep;

export type UpdateFact = {
  line: number;
  operator: string;
  target: string;
  viaThis: boolean;
  value: ValueItem[];
  branching: boolean;
  locals: string[];
  properties?: string[];
  scopes: ItemScope[];
  steps?: UpdateStep[];
};

export type TopLevelProperty = {
  name: string;
  var: boolean;
  delegated: boolean;
  initializer?: string | undefined;
  argument?: string | undefined;
};
