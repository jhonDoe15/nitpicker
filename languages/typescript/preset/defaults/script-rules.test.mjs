import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it, vi } from 'vitest';

const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-script-rules-'));
writeFileSync(path.join(root, 'package.json'), '{ "name": "app" }\n');
writeFileSync(path.join(root, 'tsconfig.json'), '{ "compilerOptions": { "strict": true } }\n');

afterAll(() => {
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});

describe('the preset config for scripts in a TypeScript project', () => {
  it('keeps the unsafe-value rules on for JavaScript files that tsconfig does not check', async () => {
    vi.stubEnv('NITPICKER_DIFF_ESLINT_PROJECT_ROOT', root);
    const url = pathToFileURL(path.join(import.meta.dirname, 'eslint.config.mjs'));
    const { default: config } = await import(`${url.href}?scripts`);

    expect(
      config.filter((entry) => entry.rules?.['@typescript-eslint/no-unsafe-assignment'] === 'off'),
    ).toEqual([]);
  });
});
