import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

export const script = path.resolve(import.meta.dirname, 'structure_metrics.py');
export const directories = [];
const interpreter = spawnSync('python3', ['-c', 'import sys; print(sys.version_info >= (3, 10))'], {
  encoding: 'utf8',
});
export const usable = interpreter.error === undefined && interpreter.stdout.trim() === 'True';

export function removeDirectories() {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
}

export function metricsOf(files) {
  const directory = mkdtempSync(path.join(tmpdir(), 'nitpicker-structure-metrics-'));
  directories.push(directory);
  for (const [file, content] of Object.entries(files)) {
    writeFileSync(path.join(directory, file), content);
  }
  const listing = path.join(directory, 'listing.txt');
  writeFileSync(listing, Object.keys(files).join('\n'));
  const output = path.join(directory, 'metrics.json');
  const result = spawnSync('python3', [script, output, directory, listing], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw result.error ?? new Error(result.stderr);
  }
  return JSON.parse(readFileSync(output, 'utf8'));
}

export function functionsOf(source) {
  return metricsOf({ 'sample.py': `${source.join('\n')}\n` });
}
export function field(source, name) {
  return functionsOf(source).map((entry) => entry[name]);
}
