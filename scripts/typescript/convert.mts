import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  GIT_TIMEOUT_MS,
  type ModuleImport,
  type Output,
  blockingImporters,
  moduleImports,
  repositoryFile,
  trackedModules,
  writeLines,
} from './module-graph.mts';

const REPOSITORY_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const CONFIG_FILE = 'nitpicker.config.json';

function convertedName(file: string): string {
  return file.replace(/\.mjs$/u, '.mts');
}

function rewrite(root: string, file: string, change: (text: string) => string): void {
  const absolute = repositoryFile(root, file);
  const text = readFileSync(absolute, 'utf8');
  const changed = change(text);
  if (changed !== text) {
    writeFileSync(absolute, changed);
  }
}

function rewriteImports(
  root: string,
  imports: readonly ModuleImport[],
  files: ReadonlySet<string>,
): void {
  const byImporter = Map.groupBy(
    imports.filter(({ target }) => files.has(target)),
    ({ importer }) => importer,
  );
  for (const [importer, rewrites] of byImporter) {
    const file = files.has(importer) ? convertedName(importer) : importer;
    const latestFirst = rewrites.toSorted((left, right) => right.start - left.start);
    rewrite(root, file, (text) =>
      latestFirst.reduce(
        (changed, { specifier, start }) =>
          `${changed.slice(0, start)}${convertedName(specifier)}${changed.slice(start + specifier.length)}`,
        text,
      ),
    );
  }
}

function pathMentions(root: string, files: readonly string[]): string[] {
  const names = files.map((file) => path.posix.basename(file));
  const found = spawnSync('git', ['grep', '-n', '-F', ...names.flatMap((name) => ['-e', name])], {
    cwd: root,
    encoding: 'utf8',
    timeout: GIT_TIMEOUT_MS,
  });
  return found.stdout
    .split('\n')
    .filter((line) => line !== '' && !/\b(?:from|import)[\s(]*['"]/u.test(line));
}

function convert(root: string, requested: readonly string[]): string[] {
  const files = new Set(requested.map((file) => path.posix.normalize(file)));
  const imports = moduleImports(root, trackedModules(root));
  const blocked = blockingImporters(imports, files);
  if (blocked.size > 0) {
    const lines = [...blocked].map(([file, importers]) => `${file} <- ${importers.join(', ')}`);
    throw new Error(`Shipped JavaScript still imports these modules:\n${lines.join('\n')}`);
  }
  for (const file of files) {
    execFileSync('git', ['mv', file, convertedName(file)], { cwd: root, timeout: GIT_TIMEOUT_MS });
    rewrite(root, CONFIG_FILE, (text) => text.replaceAll(`"${file}"`, `"${convertedName(file)}"`));
  }
  rewriteImports(root, imports, files);
  return pathMentions(root, [...files]);
}

export function printConversion(root: string, files: readonly string[], output: Output): void {
  writeLines(output, [
    'Renamed and rewrote imports. Check these references by path:',
    ...convert(root, files).map((line) => `  ${line}`),
  ]);
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  printConversion(REPOSITORY_ROOT, process.argv.slice(2), process.stdout);
}
