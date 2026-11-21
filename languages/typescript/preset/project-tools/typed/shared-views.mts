import {
  isCount as untypedIsCount,
  isStringList as untypedIsStringList,
  picked as untypedPicked,
} from '../../../../../shared/config.mts';
import {
  ignoredConfigNotice as untypedIgnoredConfigNotice,
  missingProjectConfig as untypedMissingProjectConfig,
  precedenceLayers as untypedPrecedenceLayers,
} from '../../../../../shared/conventions/tool-precedence.mts';
import {
  firstProjectFile as untypedFirstProjectFile,
  isRealPathInside as untypedIsRealPathInside,
  readRealInside as untypedReadRealInside,
  realFileInside as untypedRealFileInside,
  resolveInside as untypedResolveInside,
} from '../../../../../shared/conventions/read-inside.mts';
import { parsedJsonc as untypedParsedJsonc } from '../../../../../shared/jsonc/jsonc.mts';
import { readHeadPolicyFile as untypedReadHeadPolicyFile } from '../../../../../shared/head-policy.mts';
import type { JsoncResult, PrecedenceLayers, ToolSettings, ToolValues } from './tool-types.mts';

export const isCount: (value: unknown) => boolean = untypedIsCount;

export const isStringList: (value: unknown) => boolean = untypedIsStringList;

export const picked: (source: ToolValues, keys: readonly string[]) => ToolValues = untypedPicked;

export const precedenceLayers: (precedence?: string[]) => PrecedenceLayers =
  untypedPrecedenceLayers;

export const missingProjectConfig: (tool: string, looked: string) => string =
  untypedMissingProjectConfig;

export const ignoredConfigNotice: (ignored: string, tool: string, settings?: ToolValues) => string =
  untypedIgnoredConfigNotice;

export const firstProjectFile: (root: string, names: readonly string[]) => string | undefined =
  untypedFirstProjectFile;

export const isRealPathInside: (root: string, full: string) => boolean = untypedIsRealPathInside;

export const realFileInside: (root: string, relative: string) => string | undefined =
  untypedRealFileInside;

export const resolveInside: (root: string, relative: string) => string | undefined =
  untypedResolveInside;

const parsedJsoncRaw: (text: string) => {
  readonly kind: string;
  readonly value?: unknown;
  readonly reason?: string;
} = untypedParsedJsonc;

export function parsedJsonc(text: string): JsoncResult {
  const parsed = parsedJsoncRaw(text);
  return parsed.kind === 'json'
    ? { kind: 'json', value: parsed.value }
    : { kind: 'malformed', reason: parsed.reason ?? '' };
}

const readRealInsideRaw: (root: string, relative: string, encoding: 'utf8') => Buffer | undefined =
  untypedReadRealInside;

export function readRealInside(root: string, relative: string): string | undefined {
  return readRealInsideRaw(root, relative, 'utf8')?.toString();
}

export const readHeadPolicyFile: (environment: Readonly<Record<string, string | undefined>>) => {
  readonly tools?: Readonly<Record<string, ToolSettings | undefined>>;
} = untypedReadHeadPolicyFile;
