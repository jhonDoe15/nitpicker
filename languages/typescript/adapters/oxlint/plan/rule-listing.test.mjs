import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { importClosure } from '../../../../../shared/import-closure.mjs';
import { checkoutModulePath } from '../../../../../shared/paths/checkout-module.mjs';
import { transpiled } from '../../../../../scripts/typescript/emit.mjs';

const PACKAGE_ROOT = realpathSync(path.resolve(import.meta.dirname, '../../../../..'));
const LISTING_MODULE = 'languages/typescript/adapters/oxlint/plan/rule-listing.mjs';
const HERMETIC_GIT = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
const GIT_TIMEOUT_MS = 10_000;
const typescript = createRequire(import.meta.url)('typescript-js-api');

function shippedContents(file, contents) {
  const source = checkoutModulePath(path.join(PACKAGE_ROOT, file));
  return source.endsWith('.mts') ? transpiled(contents, source, typescript) : contents;
}

function installedInIgnoredFolder(clone) {
  execFileSync('git', ['init', '--quiet'], {
    cwd: clone,
    env: HERMETIC_GIT,
    timeout: GIT_TIMEOUT_MS,
  });
  writeFileSync(path.join(clone, '.gitignore'), 'node_modules\n');
  const installed = path.join(clone, 'node_modules/nitpicker');
  for (const [file, contents] of importClosure([LISTING_MODULE, 'package.json'], PACKAGE_ROOT)) {
    const shipped = path.join(installed, file.replace(/\.mts$/u, '.mjs'));
    mkdirSync(path.dirname(shipped), { recursive: true });
    writeFileSync(shipped, shippedContents(file, contents));
  }
  symlinkSync(path.join(PACKAGE_ROOT, 'node_modules'), path.join(installed, 'node_modules'), 'dir');
  return installed;
}

describe('the oxlint rule listing', () => {
  let clone;
  let installed;

  beforeAll(() => {
    clone = mkdtempSync(path.join(tmpdir(), 'nitpicker-hook-clone-'));
    installed = installedInIgnoredFolder(clone);
  });

  afterAll(() => {
    rmSync(clone, { recursive: true, force: true });
  });

  it('lists the rules from a copy inside a folder its git clone ignores, as pre-commit installs it', async () => {
    const { listNativeRules } = await import(
      pathToFileURL(path.join(installed, LISTING_MODULE)).href
    );

    const rules = await listNativeRules();

    expect(rules.some(({ value }) => value === 'no-debugger')).toBe(true);
  });
});
