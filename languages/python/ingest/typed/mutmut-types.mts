export type MutmutFile = {
  readonly path: string;
  readonly exitCodes: Readonly<Record<string, unknown>>;
  readonly mutated: string;
  readonly original?: string;
};

export type MutmutRun = { readonly files: readonly MutmutFile[] };

type KeyParts = {
  readonly mangled: string;
  readonly number: number;
  readonly symbol: string;
  readonly name: string;
};

export type Mutant = KeyParts & { readonly status: string };

export type ParsedKey = KeyParts | { readonly mangled?: undefined };

export type ParsedFile = { readonly file: MutmutFile; readonly mutants: readonly Mutant[] };

export type Change = {
  readonly label: string;
  readonly original?: string;
  readonly replacement?: string;
  readonly line?: number;
  readonly anchor?: string;
};

export type DescribedMutant = Change & {
  readonly path: string;
  readonly symbol: string;
  readonly status: string;
};

export type IdentifiedMutant = DescribedMutant & { readonly identity: string };

export type ChangedRegion = {
  readonly original: string;
  readonly replacement: string;
  readonly lineOffset: number;
};

export function isMutmutRun(data: unknown): data is MutmutRun {
  return typeof data === 'object' && data !== null && 'files' in data && Array.isArray(data.files);
}
