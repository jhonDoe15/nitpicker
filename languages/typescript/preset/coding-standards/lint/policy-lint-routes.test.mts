import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { removedAfterAll } from '../../../adapters/oxlint/test-support/engine-stub.mts';
import { createProject } from '../../../adapters/oxlint/test-support/oxlint-project.mts';
import type { EngineLinted } from './engine-lint.mts';
import { lintPolicy } from './policy-lint.mts';

type Route = { engine: string | undefined; linted: EngineLinted | undefined };
const route = vi.hoisted((): Route => ({ engine: undefined, linted: undefined }));

vi.mock('./engine-lint.mts', () => ({ lintWithEngine: () => Promise.resolve(route.linted) }));

vi.mock('../../../adapters/typed/head-policy.mts', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../adapters/typed/head-policy.mts')>();
  return {
    ...original,
    readHeadPolicy: () => {
      const policy = original.readHeadPolicy();
      return {
        ...policy,
        tools: { ...policy.tools, eslint: { ...policy.tools.eslint, engine: route.engine } },
      };
    },
  };
});

const policyRoot = path.resolve(import.meta.dirname, '../../../../..');
const root = createProject('coding-standards-routes-', {
  'src/a.ts': 'export const = ;\n',
  'src/b.ts': 'export const b = 1;\n',
});
removedAfterAll(root);
const files = ['src/a.ts', 'src/b.ts'].map((file) => path.join(root, file));
const engineResult = { filePath: files[1] ?? '', messages: [] };

afterEach(() => {
  route.engine = undefined;
  route.linted = undefined;
});

async function linted(): Promise<readonly [string, boolean][]> {
  const results = await lintPolicy({
    root,
    policyRoot,
    files,
    environment: {},
    nativeFrom: Infinity,
  });
  return results.map(({ filePath, messages }) => [
    path.relative(root, filePath),
    messages.some((message) => message.fatal === true),
  ]);
}

describe('the route a coding-standards lint takes', () => {
  it('lints with ESLint when the head policy asks for it', async () => {
    route.engine = 'eslint';
    route.linted = { results: [engineResult], unparsed: [] };

    expect(await linted()).toEqual([
      ['src/a.ts', true],
      ['src/b.ts', false],
    ]);
  });

  it('keeps the engine results and lints only the files the engine could not parse with ESLint', async () => {
    route.linted = { results: [engineResult], unparsed: [files[0] ?? ''] };

    expect(await linted()).toEqual([
      ['src/a.ts', true],
      ['src/b.ts', false],
    ]);
  });

  it('keeps the engine results alone when it parsed every file', async () => {
    route.linted = { results: [engineResult], unparsed: [] };

    expect(await linted()).toEqual([['src/b.ts', false]]);
  });

  it('lints without the engine when the engine does not run', async () => {
    expect(await linted()).toEqual([
      ['src/a.ts', true],
      ['src/b.ts', false],
    ]);
  });
});
