import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveLayout } from '../layout.mjs';

const policy = {
  exclude: ['lib/legacy/**'],
  layout: { sourceRoots: ['lib'], testRoots: ['spec'] },
};
const temporaryRoots = [];
const imports = { count: 0 };

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

async function loadDefault(name) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-runtime-scope-'));
  temporaryRoots.push(root);
  const policyFile = path.join(root, 'policy.json');
  writeFileSync(policyFile, JSON.stringify(policy));
  const previous = process.env.NITPICKER_POLICY;
  process.env.NITPICKER_POLICY = policyFile;
  try {
    imports.count += 1;
    const url = pathToFileURL(path.join(import.meta.dirname, '../defaults', name));
    url.search = `policy=${String(imports.count)}`;
    return (await import(url.href)).default;
  } finally {
    if (previous === undefined) {
      delete process.env.NITPICKER_POLICY;
    } else {
      process.env.NITPICKER_POLICY = previous;
    }
  }
}

describe('what each tool reads of the project', () => {
  it('keeps declaration files out of crap and stryker', async () => {
    const crap = await loadDefault('crap.config.mjs');
    const stryker = await loadDefault('stryker.config.mjs');

    expect(crap.excludes.filter((glob) => glob.endsWith('.d.ts'))).toEqual(['**/*.d.ts']);
    expect(stryker.mutate.filter((glob) => glob.endsWith('.d.ts'))).toEqual(['!**/*.d.ts']);
  });
});

describe('built-in exclusions', () => {
  it('skip node_modules at any depth and only marked generated files in root output folders', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-runtime-scope-'));
    temporaryRoots.push(root);
    const files = ['lib/a.ts', 'lib/dist/c.ts', 'dist/d.ts', 'dist/e.ts', 'lib/node_modules/f.ts'];
    for (const file of files) {
      mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      writeFileSync(path.join(root, file), 'export {};\n');
    }
    const layout = resolveLayout({ sourceRoots: ['lib', 'dist'] }, [], {
      generatedFiles: ['dist/e.ts'],
    });

    expect(layout.projectCodeFiles(root).sort()).toEqual([
      'dist/d.ts',
      'lib/a.ts',
      'lib/dist/c.ts',
    ]);
  });
});
