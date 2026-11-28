import { describe, expect, it } from 'vitest';
import { findEngine } from '../../../../../shared/engine/engine-binary.mts';
import { createProject, presetModule } from '../test-support/oxlint-project.mts';
import { removedAfterAll, reportedLines, writeStubEngine } from '../test-support/engine-stub.mts';

const STUB_MESSAGE = 'reported by the stub engine';

const policy = [
  `import tseslint from ${JSON.stringify(import.meta.resolve('typescript-eslint'))};`,
  `import { reactScopeConfigFor } from ${presetModule('eslint-config/react/react-scope.mjs')};`,
  `import { resolveLayout } from ${presetModule('layout.mjs')};`,
  'export default [',
  "  { files: ['**/*.{ts,tsx}'], languageOptions: { parser: tseslint.parser } },",
  '  ...(await reactScopeConfigFor(resolveLayout())),',
  '];',
].join('\n');

const queries = [
  "import { render, screen } from '@testing-library/react';",
  "it('finds the button', () => {",
  '  render(<button />);',
  "  screen.getByTestId('save');",
  '  // eslint-disable-next-line testing-library/no-test-id-queries -- the id is the contract',
  "  screen.getByTestId('cancel');",
  '  // eslint-disable-next-line testing-library/no-debugging-utils -- nothing to disable',
  "  screen.getByRole('button');",
  '});',
].join('\n');

const root = createProject('nitpicker-oxlint-engine-', {
  'policy.mjs': policy,
  'package.json': JSON.stringify({ name: 'app', dependencies: { react: '19.0.0' } }),
  'tsconfig.json': JSON.stringify({ compilerOptions: { types: [], lib: ['ES2022'] } }),
  'test/ui/queries.test.tsx': queries,
  'test/ui/second.test.tsx': queries,
});

const stub = writeStubEngine(root, [
  ['test/ui/queries.test.tsx', 'testing-library/no-test-id-queries', 4, 3, STUB_MESSAGE, 4, 29],
  ['test/ui/queries.test.tsx', 'testing-library/no-test-id-queries', 6, 3, STUB_MESSAGE, 6, 29],
  ['test/ui/second.test.tsx', '!parse', 1, 1, ''],
]);

removedAfterAll(root);

function reported(engine: string): Promise<string[]> {
  return reportedLines(
    { root, patterns: ['test/**/*.tsx'], engine, environment: process.env },
    (file, { ruleId, line, column, endColumn, message }) =>
      ruleId === undefined || ruleId.startsWith('testing-library/')
        ? [file, line, column, endColumn, ruleId, message].join(' | ')
        : undefined,
  );
}

function placeOf(line: string): string[] {
  return line.split(' | ').slice(0, 5);
}

function hintOf(line: string): boolean {
  return line.split(' | ').slice(5).join(' | ').startsWith(`${STUB_MESSAGE}. `);
}

describe('testing-library rules handed to the engine', () => {
  it.skipIf(process.platform === 'win32')(
    'reports what the engine found, honours disable comments, and leaves unparsed files to the rules',
    async () => {
      const lines = await reported(stub);
      const replayed = lines.filter((line) => line.includes(STUB_MESSAGE));
      const own = lines.filter(
        (line) => line.includes('no-test-id-queries') && !replayed.includes(line),
      );

      expect(replayed.map(placeOf)).toEqual([
        ['queries.test.tsx', '4', '3', '29', 'testing-library/no-test-id-queries'],
      ]);
      expect(replayed.map(hintOf)).toEqual([true]);
      expect(own.map(placeOf)).toEqual([
        ['second.test.tsx', '4', '3', '29', 'testing-library/no-test-id-queries'],
      ]);
      expect(lines.filter((line) => line.includes('Unused eslint-disable directive'))).toHaveLength(
        2,
      );
    },
  );

  it.skipIf(findEngine(process.env) === undefined)(
    'gets the same report from the engine as from the rules themselves',
    async () => {
      const [fromEngine, fromRules] = await Promise.all([
        reported(String(findEngine(process.env))),
        reported('off'),
      ]);

      expect(fromEngine).toEqual(fromRules);
      expect(fromEngine.filter((line) => line.includes('no-test-id-queries'))).toHaveLength(2);
    },
  );
});
