import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fieldOf, parseJson } from '../../../../../shared/values/readers.mts';
import { resolveHeadPolicy } from '../../head-policy.mts';
import { resolveLayout } from '../../layout.mts';
import { layoutTransformFor } from '../../tool-configs.mts';
import { defaults } from '../../layout/test-support/layout-config-loading.mts';
import { tempProjects } from '../../eslint-config/test-support/temp-projects.mts';

const layout = resolveLayout();

afterEach(() => {
  vi.unstubAllEnvs();
});

const projectWith = tempProjects('nitpicker-runner-tsconfig-');

function typesFor(policyFile: string, root: string): unknown {
  const shipped = readFileSync(path.join(defaults, policyFile), 'utf8');
  const target = path.join(root, '.nitpicker-diff-tsconfig.json');
  const transform = layoutTransformFor(policyFile, layout);
  if (transform === undefined) {
    throw new Error(`${policyFile} has no layout transform`);
  }
  return fieldOf(fieldOf(parseJson(transform(shipped, target)), 'compilerOptions'), 'types');
}

const nodeTest = { 'package.json': JSON.stringify({ scripts: { test: 'node --test' } }) };
const jestScript = { 'package.json': JSON.stringify({ scripts: { test: 'jest' } }) };
const mochaScript = { 'package.json': JSON.stringify({ scripts: { test: 'mocha' } }) };
const installed = (name: string): Record<string, string> => ({
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
      'policy.json': JSON.stringify(
        resolveHeadPolicy({ tools: { tests: { runner: 'node' } } }, undefined),
      ),
    });
    vi.stubEnv('NITPICKER_POLICY', path.join(policyRoot, 'policy.json'));

    expect(typesFor(policyFile, projectWith(jestScript))).toEqual(['node']);
  });
});
