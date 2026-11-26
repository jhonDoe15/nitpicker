import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { findEngine } from '../../../../../shared/engine/engine-binary.mts';
import { runEngineSync } from '../../../../../shared/engine/engine-run.mts';
import type { Environment } from '../../../../../shared/processes/environment.mts';
import { fieldOf, listOf, textOf } from '../../../../../shared/values/readers.mts';

export type ExtractedDependency = {
  readonly dynamic: boolean;
  readonly module: string;
  readonly moduleSystem: string;
  readonly exoticallyRequired: false;
  readonly dependencyTypes: readonly string[];
};

export type KeptDependency = { readonly module: string; readonly dynamic: boolean };

export type EngineExtraction = {
  readonly dependencies: readonly ExtractedDependency[];
  readonly kept: readonly KeptDependency[];
};

export const ENGINE_SWITCH = 'NITPICKER_IMPORT_GRAPH_ENGINE';

const TIME_LIMIT_MS = 30 * 60 * 1000;
const LIST_BREAKS = /[\t\n\r]/u;

const SHAPES: ReadonlyMap<string, readonly [string, readonly string[]]> = new Map([
  ['import', ['es6', ['import']]],
  ['import-type-only', ['es6', ['type-only', 'import']]],
  ['export', ['es6', ['export']]],
  ['export-type-only', ['es6', ['type-only', 'export']]],
  ['import-equals', ['cjs', ['import-equals']]],
  ['tsd-file', ['tsd', ['triple-slash-directive', 'triple-slash-file-reference']]],
  ['tsd-type', ['tsd', ['triple-slash-directive', 'triple-slash-type-reference']]],
  ['tsd-amd', ['tsd', ['triple-slash-directive', 'triple-slash-amd-dependency']]],
  ['require', ['cjs', ['require']]],
  ['dynamic-import', ['es6', ['dynamic-import']]],
  ['type-import', ['es6', ['type-import']]],
]);

function dependencyOf(entry: unknown): ExtractedDependency {
  const [module, kind] = listOf(entry).map(textOf);
  const shape = SHAPES.get(kind ?? '');
  if (module === undefined || shape === undefined) {
    throw new TypeError(`Unknown engine dependency: ${JSON.stringify(entry)}`);
  }
  const [moduleSystem, dependencyTypes] = shape;
  return {
    dynamic: kind === 'dynamic-import',
    module,
    moduleSystem,
    exoticallyRequired: false,
    dependencyTypes: [...dependencyTypes],
  };
}

function keptOf(entry: unknown): KeptDependency {
  const [module, dynamic] = listOf(entry);
  return { module: textOf(module), dynamic: dynamic === true };
}

export function readExtraction(text: string): Map<string, EngineExtraction> {
  const files = new Map<string, EngineExtraction>();
  for (const line of text.split('\n')) {
    if (line.length === 0) continue;
    const entry: unknown = JSON.parse(line);
    if (fieldOf(entry, 'unread') !== undefined) continue;
    files.set(textOf(fieldOf(entry, 'file')), {
      dependencies: listOf(fieldOf(entry, 'dependencies')).map(dependencyOf),
      kept: listOf(fieldOf(entry, 'kept')).map(keptOf),
    });
  }
  return files;
}

function checkNotRequired(environment: Environment, reason: string): void {
  if (environment[ENGINE_SWITCH] === 'required') {
    throw new Error(`${ENGINE_SWITCH}=required, but ${reason}`);
  }
}

type Extraction = { readonly baseDirectory: string; readonly files: readonly string[] };

function runIn(folder: string, binary: string, { baseDirectory, files }: Extraction): string {
  const list = path.join(folder, 'files.tsv');
  const out = path.join(folder, 'out.jsonl');
  const listed = files.filter((file) => !LIST_BREAKS.test(file));
  writeFileSync(list, listed.map((file) => `${path.resolve(baseDirectory, file)}\t${file}\n`).join(''));
  const { status, stderr } = runEngineSync(['typescript-import-extract', '--files', list, '--out', out], {
    binary,
    timeoutMs: TIME_LIMIT_MS,
  });
  if (status !== 0) {
    throw new Error(`typescript-import-extract ended with status ${String(status)}: ${stderr.trim()}`);
  }
  return readFileSync(out, 'utf8');
}

export function engineExtraction(
  request: Extraction,
  environment: Environment = process.env,
): Map<string, EngineExtraction> {
  if (environment[ENGINE_SWITCH] === 'off' || request.files.length === 0) return new Map();
  const binary = findEngine(environment);
  if (binary === undefined) {
    checkNotRequired(environment, 'there is no engine binary');
    return new Map();
  }
  const folder = mkdtempSync(path.join(tmpdir(), 'nitpicker-import-graph-'));
  try {
    return readExtraction(runIn(folder, binary, request));
  } catch (error) {
    checkNotRequired(environment, String(error));
    return new Map();
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}
