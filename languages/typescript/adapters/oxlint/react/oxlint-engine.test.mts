import { chmodSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { findEngine } from '../../../../../shared/engine/engine-binary.mts';
import { lintWithOxlint } from '../oxlint-runner.mts';
import { createProject, presetModule } from '../test-support/oxlint-project.mts';
import { oxlintOptions } from '../test-support/oxlint-runs.mts';

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

const stub = path.join(root, 'stub-engine.sh');
writeFileSync(
  stub,
  [
    '#!/bin/sh',
    'while [ $# -gt 0 ]; do if [ "$1" = "--out" ]; then out="$2"; fi; shift; done',
    'cat > "$out" <<\'ROWS\'',
    JSON.stringify([
      ['test/ui/queries.test.tsx', 'testing-library/no-test-id-queries', 4, 3, STUB_MESSAGE, 4, 29],
      ['test/ui/queries.test.tsx', 'testing-library/no-test-id-queries', 6, 3, STUB_MESSAGE, 6, 29],
      ['test/ui/second.test.tsx', '!parse', 1, 1, ''],
    ]),
    'ROWS',
  ].join('\n'),
);
chmodSync(stub, 0o755);

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

async function reported(engine: string): Promise<string[]> {
  const results = await lintWithOxlint({
    options: oxlintOptions(root, ['test/**/*.tsx']),
    projectConfigPath: undefined,
    environment: {
      ...process.env,
      NITPICKER_ENGINE: engine,
      NITPICKER_DIFF_ESLINT_POLICY_CONFIG: path.join(root, 'policy.mjs'),
      NITPICKER_DIFF_ESLINT_PROJECT_ROOT: root,
    },
    runEslintCli: () => Promise.resolve([]),
  });
  return results.flatMap(({ filePath, messages }) =>
    messages
      .filter(({ ruleId }) => ruleId === undefined || ruleId.startsWith('testing-library/'))
      .map(({ ruleId, line, column, endColumn, message }) =>
        [path.basename(filePath), line, column, endColumn, ruleId, message].join(' | '),
      ),
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
