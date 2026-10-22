import { spawnSyncWithOutputFile } from '../../../../../core/tooling/output-file.mjs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { collectImports, importEdges } from '../python-coupling.mjs';

const INTERPRETERS = ['python3', 'python'];
const MAX_OUTPUT_BYTES = 50 * 1024 * 1024;
const SCAN_TIMEOUT_MS = 5 * 60 * 1000;

function runScan(context, [, ...args]) {
  const failures = [];
  for (const interpreter of INTERPRETERS) {
    const result = spawnSyncWithOutputFile(interpreter, args, {
      cwd: context.projectRoot,
      encoding: 'utf8',
      maxBuffer: MAX_OUTPUT_BYTES,
      timeout: SCAN_TIMEOUT_MS,
    });
    if (result.error === undefined && result.status === 0) {
      return result;
    }
    failures.push(result.error?.message ?? result.stderr);
  }
  throw new Error(`The Python import scan failed: ${failures.join('; ')}`);
}

function withParents(module, known) {
  const parts = module.split('.');
  return parts
    .map((_, index) => parts.slice(0, index + 1).join('.'))
    .filter((candidate) => known.has(candidate));
}

function reachFrom(starts, { modules, imports }) {
  const known = new Map();
  for (const entry of modules) {
    if (!known.has(entry.module)) {
      known.set(entry.module, entry);
    }
  }
  const next = Map.groupBy(importEdges(modules, imports), ({ source }) => source);
  const labels = new Map(starts.map((entry) => [entry.module, entry.file]));
  const pending = [...labels.keys()];
  for (const module of pending) {
    const label = labels.get(module);
    const targets = (next.get(module) ?? []).flatMap(({ target }) => withParents(target, known));
    for (const target of targets.filter((candidate) => !labels.has(candidate))) {
      labels.set(target, label);
      pending.push(target);
    }
  }
  return new Map(
    [...labels]
      .filter(([module]) => !starts.some((entry) => entry.module === module))
      .map(([module, label]) => [known.get(module).file, label]),
  );
}

function asModules(entry) {
  return { ...entry, isPackage: path.posix.basename(entry.file) === '__init__.py' };
}

export function pythonProductionReach(projectRoot, { sourceRoots, isHidden }) {
  const reportRoot = mkdtempSync(path.join(tmpdir(), 'nitpicker-python-reach-'));
  try {
    const scanned = collectImports({ projectRoot, reportRoot, project: { sourceRoots } }, runScan);
    const modules = [...scanned.modules, ...scanned.others.map(asModules)];
    const starts = scanned.modules.filter(({ file }) => !isHidden(file));
    return reachFrom(starts, { modules, imports: scanned.imports });
  } finally {
    rmSync(reportRoot, { recursive: true, force: true });
  }
}
