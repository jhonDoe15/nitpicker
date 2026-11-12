import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { importClosure } from '../../../../../shared/import-closure.mjs';

const PACKAGE_ROOT = realpathSync(path.resolve(import.meta.dirname, '../../../../..'));
const LISTING_MODULE = 'languages/typescript/adapters/oxlint/plan/rule-listing.mjs';
const HERMETIC_GIT = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
const GIT_TIMEOUT_MS = 10_000;

function installedInIgnoredFolder(clone) {
  execFileSync('git', ['init', '--quiet'], {
    cwd: clone,
    env: HERMETIC_GIT,
    timeout: GIT_TIMEOUT_MS,
  });
  writeFileSync(path.join(clone, '.gitignore'), 'node_modules\n');
  const installed = path.join(clone, 'node_modules/nitpicker');
  for (const [file, contents] of importClosure([LISTING_MODULE, 'package.json'], PACKAGE_ROOT)) {
    mkdirSync(path.dirname(path.join(installed, file)), { recursive: true });
    writeFileSync(path.join(installed, file), contents);
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
