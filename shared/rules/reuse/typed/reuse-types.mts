import type { ReuseDefinition } from '../../facts/typed/reuse-module-types.mts';
import type { BaselineSource } from '../../facts/typed/fact-types.mts';

export type Copy = { readonly path: string; readonly definition: ReuseDefinition };

export type CopyModule = {
  readonly path: string;
  readonly packageRoot: string;
  readonly definitions: readonly ReuseDefinition[];
};

export type CopyOptions = {
  readonly rule: string;
  readonly isExcepted: (rule: string, ...candidates: string[]) => boolean;
  readonly isComparable: (definition: ReuseDefinition) => boolean;
  readonly keyOf: (definition: ReuseDefinition) => string;
};

export type CopyFindingContext = {
  readonly analyzerName: string;
  readonly isExcepted: (rule: string, ...candidates: string[]) => boolean;
};

export type SiblingOptions = CopyFindingContext & {
  readonly baselineFile?: BaselineSource | undefined;
  readonly acrossPackages?: true | false;
};

export type ReuseFindingDetails = {
  readonly key: string;
  readonly path: string;
  readonly identity: string;
  readonly symbol?: string | undefined;
  readonly line?: number | undefined;
  readonly values: Readonly<Record<string, string>>;
};
