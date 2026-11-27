import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { findEngine } from '../../../../../shared/engine/engine-binary.mts';
import { createProject, lintProject, presetModule } from '../test-support/oxlint-project.mts';
import { removedAfterAll, reportedLines, writeStubEngine } from '../test-support/engine-stub.mts';

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
  "process.stdout.write('done');",
].join('\n');

const root = createProject('nitpicker-engine-pass-', {
  'policy.mjs': policy,
  'package.json': JSON.stringify({ name: 'app' }),
  'tsconfig.json': JSON.stringify({ compilerOptions: { types: [], lib: ['ES2022'] } }),
  'src/first.ts': silent,
  'src/second.ts': silent,
});

const argumentsFile = path.join(root, 'stub-arguments.txt');
const listFile = path.join(root, 'stub-files.tsv');
const stub = writeStubEngine(
  root,
  [
    ['src/first.ts', 'nitpicker/no-silent-catch', 2, 3, STUB_MESSAGE],
    ['src/second.ts', '!parse', 1, 1, ''],
  ],
  { argumentsFile, listFile },
);

removedAfterAll(root);

async function reported(engine: string): Promise<string[]> {
  const lines = await reportedLines(
    { root, patterns: ['src/**/*.ts'], engine, environment: process.env },
    (file, { ruleId, line, column, message }) =>
      [file, line, column, ruleId, message.split('.')[0]].join(' | '),
  );
  return lines.sort();
}

describe('plugin rules handed to the engine', () => {
  it.skipIf(process.platform === 'win32')(
    'replays what the engine found, hands option facts over, and keeps unparsed files on the rules',
    async () => {
      const lines = await reported(stub);
      const silentCatch = lines.filter((line) => line.includes('nitpicker/no-silent-catch'));
      const engineArguments = readFileSync(argumentsFile, 'utf8').split(' ');

      const listed = readFileSync(listFile, 'utf8');

      expect(engineArguments[engineArguments.indexOf('--rules') + 1]).toBe(
        'no-production-console,no-silent-catch',
      );
      expect(listed).toBe(
        ['src/first.ts', 'src/second.ts']
          .map((file) =>
            [path.join(root, file), file, 'no-production-console.streams-allowed=true'].join('\t'),
          )
          .map((line) => `${line}\n`)
          .join(''),
      );
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

const typedPolicy = [
  `import tseslint from ${JSON.stringify(import.meta.resolve('typescript-eslint'))};`,
  `import { nitpickerRules } from ${presetModule('eslint-plugin/index.mjs')};`,
  'export default [',
  '  {',
  "    files: ['src/**/*.ts'],",
  '    languageOptions: {',
  '      parser: tseslint.parser,',
  "      parserOptions: { project: './tsconfig.json', tsconfigRootDir: import.meta.dirname },",
  '    },',
  '    plugins: { nitpicker: nitpickerRules },',
  "    rules: { 'nitpicker/no-mutating-method-in-domain': 'error' },",
  '  },',
  '];',
].join('\n');

const mutating = [
  'export function record(seen: Set<number>, when: Date, items: number[]): void {',
  '  seen.add(1);',
  '  when.setTime(0);',
  '  items.push(1);',
  '  // eslint-disable-next-line nitpicker/no-mutating-method-in-domain -- kept for the test',
  "  seen['delete'](2);",
  '}',
].join('\n');

describe('typed plugin rules handed to the engine', () => {
  const typedRoot = createProject('nitpicker-engine-typed-', {
    'policy.mjs': typedPolicy,
    'package.json': JSON.stringify({ name: 'app' }),
    'tsconfig.json': JSON.stringify({
      compilerOptions: { strict: true, types: [], lib: ['ES2022'] },
      include: ['src/**/*.ts'],
    }),
    'src/domain/record.ts': mutating,
  });
  removedAfterAll(typedRoot);

  it.skipIf(findEngine(process.env) === undefined)(
    'replays the findings without the residual ESLint pass',
    async () => {
      const results = await lintProject({
        root: typedRoot,
        patterns: ['src/**/*.ts'],
        projectConfigName: 'tsconfig.json',
      });
      const lines = results.flatMap(({ messages }) =>
        messages.map(({ ruleId, line, column, message }) =>
          [line, column, ruleId, message.split(' changes')[0]?.split(', and ')[1]].join(' | '),
        ),
      );

      expect(lines).toEqual([
        '2 | 3 | nitpicker/no-mutating-method-in-domain | Set.add',
        '3 | 3 | nitpicker/no-mutating-method-in-domain | Date.setTime',
      ]);
    },
  );
});
