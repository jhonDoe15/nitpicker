import { rmSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { findEngine } from '../../../../../shared/engine/engine-binary.mts';
import { createProject } from '../../../adapters/oxlint/test-support/oxlint-project.mts';
import { lintPolicy } from './policy-lint.mts';

const policyRoot = path.resolve(import.meta.dirname, '../../../../..');

const WRAPPED =
  "try { return read(); } catch (error) { throw new Error('failed: ' + String(error)); }";

const SOURCES: Readonly<Record<string, string>> = {
  'src/main/helper.ts': 'export const value = 1;\n',
  'src/main/wrap.ts': `export function load(read: () => string): string {\n  // eslint-disable-next-line nitpicker/preserve-error-cause\n  ${WRAPPED}\n}\n`,
  'src/main/[id].ts': `export function parse(read: () => string): string { ${WRAPPED} }\n`,
  'src/main/__tests__/consumer.test.ts':
    "import { vi, it } from 'vitest'; vi.mock('../helper.js'); it('polls', async () => { vi.useFakeTimers(); await vi.waitFor(() => {}); });\n",
  'src/main/broken.ts': 'export const = ;\n',
};

const REJECTED_BY_TYPESCRIPT: Readonly<Record<string, string>> = {
  'src/main/shape.ts': 'export abstract class Shape { abstract area() {} }\n',
  'src/main/parse.ts': `export function parse(read: () => string): string { ${WRAPPED} }\n`,
};

const roots: string[] = [];

afterAll(() => {
  for (const root of roots) {
    rmSync(root, { recursive: true, force: true });
  }
});

function project(sources: Readonly<Record<string, string>>): Project {
  const root = createProject('coding-standards-lint-', sources);
  roots.push(root);
  return { root, files: Object.keys(sources).map((file) => path.join(root, file)) };
}

type Project = { readonly root: string; readonly files: readonly string[] };

async function reported({ root, files }: Project, nativeFrom: number, engine = 'off') {
  const results = await lintPolicy({
    root,
    policyRoot,
    files,
    nativeFrom,
    environment: { ...process.env, NITPICKER_ENGINE: engine },
  });
  return results
    .filter((result) => result.messages.length > 0)
    .map((result) => ({
      file: path.relative(root, result.filePath),
      messages: result.messages.map(
        ({ ruleId, message, fatal, line, column, endLine, endColumn }) => ({
          ruleId,
          message,
          fatal,
          line,
          column,
          endLine,
          endColumn,
        }),
      ),
    }))
    .sort((left, right) => left.file.localeCompare(right.file, 'en'));
}

describe('coding-standards policy lint', () => {
  it('reports the same messages through oxlint as through ESLint', async () => {
    const sample = project(SOURCES);
    const [native, eslint] = await Promise.all([
      reported(sample, 0),
      reported(sample, Number.POSITIVE_INFINITY),
    ]);
    expect(native).toEqual(eslint);
    expect(
      native.map(({ file, messages }) => [
        file,
        messages
          .map(({ ruleId }) => ruleId ?? 'unparsed')
          .toSorted((left, right) => left.localeCompare(right, 'en')),
      ]),
    ).toEqual([
      [
        'src/main/__tests__/consumer.test.ts',
        ['nitpicker/no-internal-module-mocks', 'nitpicker/no-wait-for-with-fake-timers'],
      ],
      ['src/main/[id].ts', ['nitpicker/preserve-error-cause']],
      ['src/main/broken.ts', ['unparsed']],
      ['src/main/wrap.ts', ['nitpicker/preserve-error-cause']],
    ]);
  });

  it('lints with ESLint when oxlint reports a TypeScript error it has no rule for', async () => {
    const sample = project(REJECTED_BY_TYPESCRIPT);
    const native = await reported(sample, 0);
    expect(native).toEqual(await reported(sample, Number.POSITIVE_INFINITY));
    expect(native.map(({ file }) => file)).toEqual(['src/main/parse.ts', 'src/main/shape.ts']);
  });

  it.skipIf(findEngine(process.env) === undefined).each([
    ['files the compiler accepts', SOURCES],
    ['a file only the compiler rejects', REJECTED_BY_TYPESCRIPT],
  ])(
    'reports the same messages through the engine as through ESLint for %s',
    async (_, sources) => {
      const sample = project(sources);
      const [engine, eslint] = await Promise.all([
        reported(sample, Number.POSITIVE_INFINITY, String(findEngine(process.env))),
        reported(sample, Number.POSITIVE_INFINITY),
      ]);

      expect(engine).toEqual(eslint);
    },
  );

  it('lints nothing for a project without code files', async () => {
    expect(await lintPolicy({ root: policyRoot, policyRoot, files: [], environment: {} })).toEqual(
      [],
    );
  });
});
