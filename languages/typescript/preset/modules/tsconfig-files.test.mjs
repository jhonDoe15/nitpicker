import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { projectChecksJavascript } from './tsconfig-files.mjs';

describe('projectChecksJavascript', () => {
  it('reads checkJs through the project tsconfig and what it extends', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-check-js-'));
    writeFileSync(path.join(root, 'base.json'), '{ "compilerOptions": { "checkJs": true } }');
    const checked = projectChecksJavascript(root);
    writeFileSync(path.join(root, 'tsconfig.json'), '{ "extends": "./base.json" }');
    const extended = projectChecksJavascript(root);
    rmSync(root, { recursive: true, force: true });

    expect([checked, extended]).toEqual([false, true]);
  });
});
