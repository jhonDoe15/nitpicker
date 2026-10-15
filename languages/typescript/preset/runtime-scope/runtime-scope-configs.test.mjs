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
  it('turns on the script rules typescript-eslint leaves off for .js files', async () => {
    const config = await loadDefault('eslint.config.mjs');
    const scriptEntry = config.find(
      (entry) =>
        entry.rules?.['no-var'] === 'error' &&
        entry.files?.includes('lib/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}'),
    );

    expect(scriptEntry?.rules).toEqual({
      'no-var': 'error',
      'prefer-const': 'error',
      'prefer-rest-params': 'error',
      'prefer-spread': 'error',
    });
  });

  it('keeps declaration files out of crap and stryker while lint reads them', async () => {
    const crap = await loadDefault('crap.config.mjs');
    const stryker = await loadDefault('stryker.config.mjs');
    const lint = await loadDefault('eslint.config.mjs');

    expect(crap.excludes.filter((glob) => glob.endsWith('.d.ts'))).toEqual(['**/*.d.ts']);
    expect(stryker.mutate.filter((glob) => glob.endsWith('.d.ts'))).toEqual(['!**/*.d.ts']);
    expect(lint.flatMap((entry) => entry.ignores ?? [])).not.toContain('**/*.d.ts');
  });
});

describe('built-in exclusions', () => {
  it('skip output folders only at the project root and node_modules at any depth', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-runtime-scope-'));
    temporaryRoots.push(root);
    for (const file of ['lib/a.ts', 'lib/dist/c.ts', 'dist/d.ts', 'lib/node_modules/e.ts']) {
      mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      writeFileSync(path.join(root, file), 'export {};\n');
    }
    const layout = resolveLayout({ sourceRoots: ['lib', 'dist'] });

    expect(layout.projectCodeFiles(root).sort()).toEqual(['lib/a.ts', 'lib/dist/c.ts']);
  });
});
