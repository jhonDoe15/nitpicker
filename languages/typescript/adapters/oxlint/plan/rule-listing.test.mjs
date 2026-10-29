import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { importClosure } from '../../../../../shared/import-closure.mjs';

const PACKAGE_ROOT = realpathSync(path.resolve(import.meta.dirname, '../../../../..'));
const LISTING_MODULE = 'languages/typescript/adapters/oxlint/plan/rule-listing.mjs';
const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function installedInIgnoredFolder() {
  const clone = mkdtempSync(path.join(tmpdir(), 'nitpicker-hook-clone-'));
  roots.push(clone);
  execFileSync('git', ['init', '--quiet'], { cwd: clone });
  writeFileSync(path.join(clone, '.gitignore'), 'node_modules\n');
  const installed = path.join(clone, 'node_modules/nitpicker');
  const files = importClosure([LISTING_MODULE, 'package.json'], PACKAGE_ROOT);
  for (const [file, contents] of files) {
    mkdirSync(path.dirname(path.join(installed, file)), { recursive: true });
    writeFileSync(path.join(installed, file), contents);
  }
  symlinkSync(path.join(PACKAGE_ROOT, 'node_modules'), path.join(installed, 'node_modules'), 'dir');
  return installed;
}

describe('the oxlint rule listing', () => {
  it('lists the rules from a copy inside a folder its git clone ignores, as pre-commit installs it', () => {
    const installed = installedInIgnoredFolder();
    const script = [
      `import { listNativeRules } from ${JSON.stringify(path.join(installed, LISTING_MODULE))};`,
      'const rules = await listNativeRules();',
      "process.stdout.write(String(rules.some(({ value }) => value === 'no-debugger')));",
    ].join('\n');

    const output = execFileSync(process.execPath, ['--input-type=module', '--eval', script], {
      cwd: installed,
      encoding: 'utf8',
    });

    expect(output).toBe('true');
  });
});
