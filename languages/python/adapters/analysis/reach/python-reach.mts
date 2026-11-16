import { spawnSyncWithOutputFile as untypedSpawnSync } from '../../../../../core/tooling/output-file/output-file.mjs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { collectImports, importEdges } from '../python-coupling.mts';
import { entryOf } from '../../imports/typed/import-rule-types.mts';
import type { SpawnResult } from '../../execution/typed/process-types.mts';
import type { ScanContext } from '../typed/coupling-types.mts';
import type { ImportsByFile, OtherModule, PythonModule } from '../typed/python-graph-types.mts';

type ReachScan = {
  readonly scanned: { modules: PythonModule[]; others: OtherModule[]; imports: ImportsByFile };
  readonly modules: PythonModule[];
};
type ReachOptions = { sourceRoots: readonly string[]; isHidden: (file: string) => boolean };

const spawnSyncWithOutputFile: (
  command: string,
  args: readonly string[],
  options: {
    cwd: string;
    encoding: 'utf8';
    maxBuffer: number;
    timeout: number;
  },
) => SpawnResult = untypedSpawnSync;
const INTERPRETERS = ['python3', 'python'];
const MAX_OUTPUT_BYTES = 50 * 1024 * 1024;
const SCAN_TIMEOUT_MS = 5 * 60 * 1000;

function runScan(
  context: ScanContext & { analyzerDeadlineMs?: number | undefined },
  [, ...args]: readonly string[],
): SpawnResult {
  const failures: string[] = [];
  for (const interpreter of INTERPRETERS) {
    const result = spawnSyncWithOutputFile(interpreter, args, {
      cwd: context.projectRoot,
      encoding: 'utf8',
      maxBuffer: MAX_OUTPUT_BYTES,
      timeout: context.analyzerDeadlineMs ?? SCAN_TIMEOUT_MS,
    });
    if (result.error === undefined && result.status === 0) {
      return result;
    }
    failures.push(result.error?.message ?? result.stderr);
  }
  throw new Error(`The Python import scan failed: ${failures.join('; ')}`);
}

function withParents(module: string, known: ReadonlyMap<string, unknown>): string[] {
  const parts = module.split('.');
  return parts
    .map((_, index) => parts.slice(0, index + 1).join('.'))
    .filter((candidate) => known.has(candidate));
}

function reachFrom(
  starts: readonly PythonModule[],
  { modules, imports }: { modules: readonly PythonModule[]; imports: ImportsByFile },
): Map<string, string> {
  const known = new Map<string, PythonModule>();
  for (const entry of modules) {
    if (!known.has(entry.module)) {
      known.set(entry.module, entry);
    }
  }
  const next = Map.groupBy(importEdges(modules, imports), ({ source }) => source);
  const labels = new Map(starts.map((entry) => [entry.module, entry.file]));
  const startModules = new Set(starts.map((entry) => entry.module));
  const pending = [...labels.keys()];
  for (const module of pending) {
    const label = labels.get(module) ?? '';
    const targets = (next.get(module) ?? []).flatMap(({ target }) => withParents(target, known));
    for (const target of targets.filter((candidate) => !labels.has(candidate))) {
      labels.set(target, label);
      pending.push(target);
    }
  }
  return new Map(
    [...labels]
      .filter(([module]) => !startModules.has(module))
      .map(([module, label]) => [entryOf(known, module).file, label]),
  );
}

function asModules(entry: OtherModule): PythonModule {
  return { ...entry, isPackage: path.posix.basename(entry.file) === '__init__.py' };
}

function withScan<Result>(
  projectRoot: string,
  sourceRoots: readonly string[],
  read: (scan: ReachScan) => Result,
): Result {
  const reportRoot = mkdtempSync(path.join(tmpdir(), 'nitpicker-python-reach-'));
  try {
    const scanned = collectImports({ projectRoot, reportRoot, project: { sourceRoots } }, runScan);
    return read({
      scanned,
      modules: [...scanned.modules, ...scanned.others.map(asModules)],
    });
  } finally {
    rmSync(reportRoot, { recursive: true, force: true });
  }
}

export function pythonProductionReach(
  projectRoot: string,
  { sourceRoots, isHidden }: ReachOptions,
): Map<string, string> {
  return withScan(projectRoot, sourceRoots, ({ scanned, modules }) =>
    reachFrom(
      scanned.modules.filter(({ file }) => !isHidden(file)),
      { modules, imports: scanned.imports },
    ),
  );
}

export function pythonImportedFiles(
  projectRoot: string,
  { sourceRoots, isHidden }: ReachOptions,
): Set<string> {
  return withScan(projectRoot, sourceRoots, ({ scanned, modules }) => {
    const files = new Map(modules.toReversed().map(({ module, file }) => [module, file]));
    const importers = new Set(
      scanned.modules.filter(({ file }) => !isHidden(file)).map(({ module }) => module),
    );
    return new Set(
      importEdges(modules, scanned.imports)
        .filter(({ source, target }) => importers.has(source) && source !== target)
        .flatMap(({ target }) => withParents(target, files))
        .flatMap((module) => files.get(module) ?? []),
    );
  });
}
