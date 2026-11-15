import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { reachableModules as untypedReachableModules } from '../../../../modules/module-resolution.mjs';
import { readStamped as untypedReadStamped } from '../../../../modules/stamped-file-cache.mjs';
import { scanDomEvidence, type DomEvidence } from './dom-evidence.mts';

export type ModuleAlias = { readonly find: string | RegExp; readonly replacement: string };

type Signal = 'usesDom' | 'touchesDom';
type Verdict = boolean | undefined;
type ReachStep =
  | { readonly file: string; readonly truncated?: undefined }
  | { readonly truncated: boolean; readonly file?: undefined };
type StampedCache<Value> = Map<string, { readonly stamp: string; readonly value: Value }>;

const reachableModules: (
  entries: string,
  specifiersOf: (file: string) => readonly string[],
  limits: {
    readonly maxDepth: number;
    readonly maxFiles: number;
    readonly aliases: readonly ModuleAlias[];
  },
) => Iterable<ReachStep> = untypedReachableModules;
const readStamped: <Value>(
  cache: StampedCache<Value>,
  file: string,
  read: (file: string) => Value,
) => Value | undefined = untypedReadStamped;

const LIMITS = { maxDepth: 8, maxFiles: 200 };
const COMPONENT_MODULE = /\.(?:[jt]sx|vue|svelte|astro)$/u;
const SCANNED_MODULE = /\.[cm]?[jt]sx?$/u;

const evidenceCache: StampedCache<DomEvidence> = new Map();

function evidenceOf(file: string): DomEvidence | undefined {
  return readStamped(evidenceCache, file, (scanned) =>
    scanDomEvidence(readFileSync(scanned, 'utf8'), scanned),
  );
}

function scannedEvidence(file: string): DomEvidence | undefined {
  return SCANNED_MODULE.test(file) && !file.endsWith('.d.ts') ? evidenceOf(file) : undefined;
}

function domVerdict(file: string, signal: Signal): Verdict {
  if (signal === 'usesDom' && COMPONENT_MODULE.test(file)) {
    return true;
  }
  const evidence = scannedEvidence(file);
  if (evidence?.[signal] === true) {
    return true;
  }
  return evidence?.opaqueImport === true ? undefined : false;
}

function closureVerdict(
  entryFile: string,
  {
    entrySpecifiers,
    aliases,
    signal,
  }: {
    readonly entrySpecifiers: readonly string[];
    readonly aliases: readonly ModuleAlias[];
    readonly signal: Signal;
  },
): Verdict {
  function specifiersOf(file: string): readonly string[] {
    return file === entryFile ? entrySpecifiers : (scannedEvidence(file)?.specifiers ?? []);
  }
  for (const step of reachableModules(entryFile, specifiersOf, { ...LIMITS, aliases })) {
    const verdict = step.file === undefined ? undefined : domVerdict(step.file, signal);
    if (verdict !== false) {
      return verdict;
    }
  }
  return false;
}

export function closureUsesDom(
  entryFile: string,
  entrySpecifiers: readonly string[],
  aliases: readonly ModuleAlias[] = [],
): Verdict {
  return closureVerdict(entryFile, { entrySpecifiers, aliases, signal: 'usesDom' });
}

const SETUP_ENTRY = '__nitpicker_setup_entry__.ts';

function setupFileVerdict(
  entry: string,
  directory: string,
  aliases: readonly ModuleAlias[],
): Verdict {
  if (path.isAbsolute(entry) && !existsSync(entry)) {
    return undefined;
  }
  const syntheticFile = path.join(directory, SETUP_ENTRY);
  const { specifiers } = scanDomEvidence(`import ${JSON.stringify(entry)};`, syntheticFile);
  return closureVerdict(syntheticFile, {
    entrySpecifiers: specifiers,
    aliases,
    signal: 'touchesDom',
  });
}

export function setupUsesDom(
  setupFiles: readonly string[],
  directory: string,
  aliases: readonly ModuleAlias[] = [],
): boolean {
  return setupFiles.some((entry) => setupFileVerdict(entry, directory, aliases) !== false);
}
