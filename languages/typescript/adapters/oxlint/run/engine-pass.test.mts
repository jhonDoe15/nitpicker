import { chmodSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { findEngine } from '../../../../../shared/engine/engine-binary.mts';
import { lintWithOxlint } from '../oxlint-runner.mts';
import { createProject, presetModule } from '../test-support/oxlint-project.mts';
import { oxlintOptions } from '../test-support/oxlint-runs.mts';

const STUB_MESSAGE = 'reported by the stub engine';

const policy = [
  `import tseslint from ${JSON.stringify(import.meta.resolve('typescript-eslint'))};`,
  `import { nitpickerRules } from ${presetModule('eslint-plugin/index.mjs')};`,
  'export default [',
  '  {',
  "    files: ['src/**/*.ts'],",
  '    languageOptions: { parser: tseslint.parser },',
  '    plugins: { nitpicker: nitpickerRules },',
  '    rules: {',
  "      'nitpicker/no-silent-catch': 'error',",
  "      'nitpicker/no-production-console': ['error', { allowStandardStreams: true }],",
  '    },',
  '  },',
  '];',
].join('\n');

const silent = [
  'export function load(read: () => string): string {',
  '  try {',
  '    return read();',
  '  } catch {',
  "    return '';",
  '  }',
  '}',
  '// eslint-disable-next-line nitpicker/no-silent-catch -- nothing to disable',
  "console.log('loaded');",
].join('\n');

const root = createProject('nitpicker-engine-pass-', {
  'policy.mjs': policy,
  'package.json': JSON.stringify({ name: 'app' }),
  'tsconfig.json': JSON.stringify({ compilerOptions: { types: [], lib: ['ES2022'] } }),
  'src/first.ts': silent,
  'src/second.ts': silent,
});

const stub = path.join(root, 'stub-engine.sh');
const argumentsFile = path.join(root, 'stub-arguments.txt');
writeFileSync(
  stub,
  [
    '#!/bin/sh',
    `echo "$@" > ${JSON.stringify(argumentsFile)}`,
    'while [ $# -gt 0 ]; do if [ "$1" = "--out" ]; then out="$2"; fi; shift; done',
    'cat > "$out" <<\'ROWS\'',
    JSON.stringify([
      ['src/first.ts', 'nitpicker/no-silent-catch', 2, 3, STUB_MESSAGE],
      ['src/second.ts', '!parse', 1, 1, ''],
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
    options: oxlintOptions(root, ['src/**/*.ts']),
    projectConfigPath: undefined,
    environment: {
      ...process.env,
      NITPICKER_ENGINE: engine,
      NITPICKER_DIFF_ESLINT_POLICY_CONFIG: path.join(root, 'policy.mjs'),
      NITPICKER_DIFF_ESLINT_PROJECT_ROOT: root,
    },
    runEslintCli: () => Promise.resolve([]),
  });
  return results
    .flatMap(({ filePath, messages }) =>
      messages.map(({ ruleId, line, column, message }) =>
        [path.basename(filePath), line, column, ruleId, message.split('.')[0]].join(' | '),
      ),
    )
    .sort();
}

describe('plugin rules handed to the engine', () => {
  it.skipIf(process.platform === 'win32')(
    'replays what the engine found and keeps rules with options and unparsed files on the rules',
    async () => {
      const lines = await reported(stub);
      const silentCatch = lines.filter((line) => line.includes('nitpicker/no-silent-catch'));
      const engineArguments = readFileSync(argumentsFile, 'utf8').split(' ');

      expect(engineArguments[engineArguments.indexOf('--rules') + 1]).toBe('no-silent-catch');
      expect(engineArguments).not.toContain('--testing-library-scope');
      expect(silentCatch).toEqual([
        `first.ts | 2 | 3 | nitpicker/no-silent-catch | ${STUB_MESSAGE}`,
        expect.stringMatching(/^second\.ts \| 4 \| 5 \| nitpicker\/no-silent-catch \| /u),
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
      expect(fromEngine.filter((line) => line.includes('no-silent-catch'))).toHaveLength(2);
    },
  );
});
