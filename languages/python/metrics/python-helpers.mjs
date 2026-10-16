import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

export const script = path.resolve(import.meta.dirname, 'structure_metrics.py');

export function pythonUsable() {
  const interpreter = spawnSync(
    'python3',
    ['-c', 'import sys; print(sys.version_info >= (3, 10))'],
    { encoding: 'utf8' },
  );
  return interpreter.error === undefined && interpreter.stdout.trim() === 'True';
}

function writeFiles(root, files) {
  for (const [file, content] of Object.entries(files)) {
    const target = path.resolve(root, file);
    if (!target.startsWith(`${root}${path.sep}`)) {
      throw new Error(`${file} is outside ${root}`);
    }
    writeFileSync(target, content);
  }
}

export function createMetrics() {
  const directories = [];

  function directory(prefix = 'nitpicker-structure-metrics-') {
    const created = mkdtempSync(path.join(tmpdir(), prefix));
    directories.push(created);
    return created;
  }

  function cleanup() {
    for (const created of directories.splice(0)) {
      rmSync(created, { recursive: true, force: true });
    }
  }

  function metricsOf(files) {
    const root = directory();
    writeFiles(root, files);
    const listing = path.join(root, 'listing.txt');
    writeFileSync(listing, Object.keys(files).join('\n'));
    const output = path.join(root, 'metrics.json');
    const result = spawnSync('python3', [script, output, root, listing], { encoding: 'utf8' });
    if (result.status !== 0) {
      throw result.error ?? new Error(result.stderr);
    }
    return JSON.parse(readFileSync(output, 'utf8'));
  }

  function functionsOf(source) {
    return metricsOf({ 'sample.py': `${source.join('\n')}\n` });
  }

  function field(source, name) {
    return functionsOf(source).map((entry) => entry[name]);
  }

  return { directory, cleanup, metricsOf, functionsOf, field };
}
