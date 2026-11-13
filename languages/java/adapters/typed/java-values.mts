import type { SpawnSyncOptionsWithStringEncoding, SpawnSyncReturns } from 'node:child_process';
import { fieldsOf } from '../../../../shared/values/readers.mts';

type JavaLocation = {
  readonly line?: number;
  readonly column?: number;
  readonly endLine?: number;
  readonly endColumn?: number;
};

export type JavaFinding = {
  readonly tool: string;
  readonly rule: string;
  readonly path: string;
  readonly identity?: string;
  readonly message?: string;
  readonly classification?: string;
  readonly location?: JavaLocation;
  readonly [field: string]: unknown;
};

export type JavaPolicy = {
  readonly snapshot?: string | undefined;
  readonly preset?: string | undefined;
  readonly baselineRoot?: string | undefined;
  readonly policyRoot?: string | undefined;
  readonly logRoot?: string | undefined;
  readonly logLabel?: string | undefined;
  readonly conventions?: unknown;
  readonly history?: unknown;
  readonly kotlinFormatter?: unknown;
  readonly duplicateSkippedFolders?: unknown;
  readonly layout?: unknown;
  readonly crapLimit?: unknown;
  readonly quick?: unknown;
  readonly fileLimits?: unknown;
  readonly exclude?: unknown;
  readonly exceptions?: unknown;
  readonly testSeconds?: unknown;
  readonly testConsoleAllow?: unknown;
  readonly javaStyle?: unknown;
  readonly baselineMovesFile?: unknown;
  readonly [field: string]: unknown;
};

export type SourceReader = (file: string) => string | undefined;

export type JavaSpawn = (
  command: string,
  args: readonly string[],
  options: SpawnSyncOptionsWithStringEncoding,
) => SpawnSyncReturns<string>;

export type JavaEnvironment = Readonly<Record<string, string | undefined>>;

export function callUntyped(untyped: unknown, ...args: readonly unknown[]): unknown {
  if (typeof untyped !== 'function') {
    throw new TypeError('callUntyped needs a function');
  }
  return Reflect.apply(untyped, undefined, args);
}

function isJavaFinding(value: unknown): value is JavaFinding {
  return (
    typeof value === 'object' &&
    value !== null &&
    'tool' in value &&
    typeof value.tool === 'string' &&
    'rule' in value &&
    typeof value.rule === 'string' &&
    'path' in value &&
    typeof value.path === 'string'
  );
}

export function findingsOf(value: unknown): JavaFinding[] {
  return Array.isArray(value) ? value.filter(isJavaFinding) : [];
}

export function optionalText(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export function javaPolicyOf(value: unknown): JavaPolicy {
  const fields = fieldsOf(value);
  return {
    ...fields,
    snapshot: optionalText(fields['snapshot']),
    preset: optionalText(fields['preset']),
    baselineRoot: optionalText(fields['baselineRoot']),
    policyRoot: optionalText(fields['policyRoot']),
    logRoot: optionalText(fields['logRoot']),
    logLabel: optionalText(fields['logLabel']),
  };
}
