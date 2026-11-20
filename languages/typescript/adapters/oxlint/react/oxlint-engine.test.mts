import { chmodSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { findEngine } from '../../../../../shared/engine/engine-binary.mts';
import { checkoutModulePath } from '../../../../../shared/paths/checkout-module.mjs';
import { lintWithOxlint } from '../oxlint-runner.mts';
import { createProject } from '../test-support/oxlint-project.mts';
import { oxlintOptions } from '../test-support/oxlint-runs.mts';

const packageRoot = path.resolve(import.meta.dirname, '../../../../..');
const preset = path.join(packageRoot, 'languages/typescript/preset');
const OXLINT_TIMEOUT_MS = 60_000;
const STUB_MESSAGE = 'reported by the stub engine';

function presetModule(file: string): string {
  return JSON.stringify(checkoutModulePath(`${preset}/${file}`));
}

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

describe('testing-library rules handed to the engine', () => {
  it.skipIf(process.platform === 'win32')(
    'reports what the engine found, honours disable comments, and leaves unparsed files to the rules',
    async () => {
      const lines = await reported(stub);
      const replayed = lines.filter((line) => line.includes(STUB_MESSAGE));
      const own = lines.filter(
        (line) => line.includes('no-test-id-queries') && !replayed.includes(line),
      );

      expect(replayed).toHaveLength(1);
      expect(replayed[0]).toMatch(
        /^queries\.test\.tsx \| 4 \| 3 \| 29 \| testing-library\/no-test-id-queries \| reported by the stub engine\. \S/u,
      );
      expect(own).toHaveLength(1);
      expect(own[0]).toMatch(/^second\.test\.tsx \| 4 \| 3 \| 29 \| /u);
      expect(lines.filter((line) => line.includes('Unused eslint-disable directive'))).toHaveLength(
        2,
      );
    },
    OXLINT_TIMEOUT_MS,
  );

  it.skipIf(findEngine() === undefined)(
    'gets the same report from the engine as from the rules themselves',
    async () => {
      const fromEngine = await reported(String(findEngine()));
      const fromRules = await reported('off');

      expect(fromEngine).toEqual(fromRules);
      expect(fromEngine.filter((line) => line.includes('no-test-id-queries'))).toHaveLength(2);
    },
    2 * OXLINT_TIMEOUT_MS,
  );
});
