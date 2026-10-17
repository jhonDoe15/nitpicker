import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { resolveHeadPolicy } from '../head-policy.mjs';
import { resolveLayout } from '../layout.mjs';
import { layoutTransformFor } from '../tool-configs.mjs';
import { defaults } from '../layout/test-support/layout-config-helpers.mjs';

const roots = [];
const layout = resolveLayout();

afterEach(() => {
  vi.unstubAllEnvs();
});

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function projectWith(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-runner-tsconfig-'));
  roots.push(root);
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), text);
  }
  return root;
}

function typesFor(policyFile, root) {
  const shipped = readFileSync(path.join(defaults, policyFile), 'utf8');
  const target = path.join(root, '.nitpicker-diff-tsconfig.json');
  return JSON.parse(layoutTransformFor(policyFile, layout)(shipped, target)).compilerOptions.types;
}

const nodeTest = { 'package.json': JSON.stringify({ scripts: { test: 'node --test' } }) };
const jestScript = { 'package.json': JSON.stringify({ scripts: { test: 'jest' } }) };
const mochaScript = { 'package.json': JSON.stringify({ scripts: { test: 'mocha' } }) };
const installed = (name) => ({
  [`node_modules/${name}/package.json`]: JSON.stringify({ name, version: '1.0.0' }),
});

describe.each(['tsconfig.quality.json', 'tsconfig.stryker.json'])('%s types', (policyFile) => {
  it('keep the Vitest globals for a Vitest project', () => {
    expect(typesFor(policyFile, projectWith({}))).toEqual(['node', 'vitest/globals']);
  });

  it('drop the Vitest globals for a node:test project', () => {
    expect(typesFor(policyFile, projectWith(nodeTest))).toEqual(['node']);
  });

  it('use the Jest types when @types/jest is installed', () => {
    const root = projectWith({ ...jestScript, ...installed('@types/jest') });

    expect(typesFor(policyFile, root)).toEqual(['node', 'jest']);
  });

  it('leave the Jest types out when @types/jest is missing', () => {
    expect(typesFor(policyFile, projectWith(jestScript))).toEqual(['node']);
  });

  it('use the Mocha types when @types/mocha is installed', () => {
    const root = projectWith({ ...mochaScript, ...installed('@types/mocha') });

    expect(typesFor(policyFile, root)).toEqual(['node', 'mocha']);
  });

  it('follow the runner the policy configures over the one the project shows', () => {
    const policyRoot = projectWith({
      'policy.json': JSON.stringify(resolveHeadPolicy({ tools: { tests: { runner: 'node' } } })),
    });
    vi.stubEnv('NITPICKER_POLICY', path.join(policyRoot, 'policy.json'));

    expect(typesFor(policyFile, projectWith(jestScript))).toEqual(['node']);
  });
});
