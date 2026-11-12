import { realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  type Output,
  convertibleTogether,
  isConverted,
  moduleImports,
  trackedModules,
  waitingOn,
  writeLines,
} from './module-graph.mts';

const REPOSITORY_ROOT = fileURLToPath(new URL('../..', import.meta.url));

export function readiness(root: string, folder: string): { ready: string[]; waiting: string[] } {
  const prefix = folder === '.' ? '' : `${folder.replace(/\/+$/u, '')}/`;
  const modules = trackedModules(root);
  const imports = moduleImports(root, modules);
  const candidates = modules.filter((file) => file.startsWith(prefix) && !isConverted(file));
  const ready = convertibleTogether(imports, candidates);
  const waiting = candidates
    .filter((file) => !ready.has(file))
    .map((file) => `${file} (imported by ${waitingOn(imports, file, ready).join(', ')})`);
  return { ready: [...ready].sort(), waiting };
}

export function printReadiness(root: string, folder: string, output: Output): void {
  const { ready, waiting } = readiness(root, path.posix.normalize(folder));
  writeLines(output, [
    `Ready to convert together (${String(ready.length)}):`,
    ...ready.map((file) => `  ${file}`),
    `Waiting on shipped JavaScript importers (${String(waiting.length)}):`,
    ...waiting.map((file) => `  ${file}`),
  ]);
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  printReadiness(REPOSITORY_ROOT, process.argv[2] ?? '.', process.stdout);
}
