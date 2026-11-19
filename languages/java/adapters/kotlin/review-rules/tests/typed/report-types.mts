import type { ClassInfo, TestScanned } from './discovery-types.mts';

export type Report = { rule: string; offset: number; symbol: string; key: string; message: string };

export type ScannedFile = { file: string; scanned: TestScanned };

export type Region = { supers: string[]; text: string };

export type ProjectFlags = {
  regions: Map<string, Region[]>;
  replacers: RegExp | undefined;
  coroutineTestScope: boolean;
  topLevel: Map<string, Set<string>>;
  disabling: Set<string>;
  constants: Map<string, boolean>;
  kotestIsolated: boolean;
};

export type HolderScope = { scope: 'file' } | { scope: 'class'; klass: ClassInfo | undefined };

export type SharedHolder = HolderScope & {
  name: string;
  offset: number;
  reassignable: boolean;
  collection: boolean;
};

export type SiteRange = { start: number; end: number; symbol: string; from?: number };

export type WriteHit = { offset: number; kind: string; call: string | undefined; counts: boolean };

export type Keyed = { symbol: string; offset: number; key: string };

export type Exec = ReturnType<RegExp['exec']>;
