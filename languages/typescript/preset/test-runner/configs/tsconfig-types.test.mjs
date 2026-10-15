import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { withTestRunnerTypes } from './tsconfig-types.mjs';

function tsconfig(types) {
  return { compilerOptions: { strict: true, lib: ['ES2022'], types } };
}

const BASE = JSON.stringify(tsconfig(['node', 'vitest/globals']));

function formatted(types) {
  return `${JSON.stringify(tsconfig(types), null, 2)}\n`;
}

function project(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-types-'));
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), content);
  }
  return root;
}

describe('withTestRunnerTypes', () => {
  it('keeps the Vitest globals for a Vitest project', () => {
    const root = project({ 'package.json': '{"devDependencies":{"vitest":"4.1.11"}}' });
    expect(withTestRunnerTypes(BASE, root)).toBe(BASE);
  });

  it('drops the Vitest globals for a Jest project without Jest types', () => {
    const root = project({ 'package.json': '{"devDependencies":{"jest":"30.5.2"}}' });
    expect(withTestRunnerTypes(BASE, root)).toBe(formatted(['node']));
  });

  it('swaps in the Jest types when the project installs them', () => {
    const root = project({
      'package.json': '{"devDependencies":{"jest":"30.5.2"}}',
      'node_modules/@types/jest/index.d.ts': '',
    });
    expect(withTestRunnerTypes(BASE, root)).toBe(formatted(['node', 'jest']));
  });

  it('drops the Vitest globals for a node:test project', () => {
    const root = project({
      'package.json': '{"scripts":{"test":"node --test"}}',
      'src/a.test.ts': "import test from 'node:test';",
    });
    expect(withTestRunnerTypes(BASE, root)).toBe(formatted(['node']));
  });
});
