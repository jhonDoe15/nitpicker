import { checkoutModuleUrl } from '../../../../shared/paths/checkout-module.mjs';
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { firstOf } from '../eslint/test-support/finding-comparison.mts';
import { oxlintBinary } from './oxlint-process.mts';
import type { LintResult } from './plan/oxlint-shapes.mts';
import { rejectedRuleIds } from './oxlint-translation.mts';
import { createProject, lintProject, TYPED_POLICY } from './test-support/oxlint-project.mts';

const PLUGIN = checkoutModuleUrl(
  new URL('../../preset/eslint-plugin/index.mjs', import.meta.url),
).href;

vi.mock('node:os', async (importOriginal) => ({
  ...(await importOriginal()),
  availableParallelism: () => 16,
}));

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return { ...actual, spawn: vi.fn(actual.spawn) };
});

const POLICY = `import tseslint from ${JSON.stringify(import.meta.resolve('typescript-eslint'))};
import { nitpickerRules } from ${JSON.stringify(PLUGIN)};

const local = {
  rules: {
    'no-foo': {
      meta: { type: 'problem', schema: [], messages: { foo: 'No foo.' } },
      create(context) {
        return {
          Identifier(node) {
            if (node.name === 'foo') context.report({ node, messageId: 'foo' });
          },
        };
      },
    },
  },
};

export default [
  {
    files: ['src/**/*.ts'],
    languageOptions: { parser: tseslint.parser },
    plugins: { local, nitpicker: nitpickerRules },
    rules: {
      'nitpicker/require-atomic-updates': ['error', { allowProperties: false }],
      'no-debugger': 'error',
      'no-irregular-whitespace': 'error',
      'local/no-foo': 'error',
    },
  },
  { files: ['src/strict/**/*.ts'], linterOptions: { noInlineConfig: true } },
];
`;

const SOURCES = {
  'src/atomic.ts': 'export async function update(state, load) { state.total += await load(); }',
  'src/atomic-local.ts':
    'export async function update(req, verify) { const user = await verify(req.token); req.user = user; }',
  'src/plain.ts': "// eslint-disable-next-line no-debugger\ndebugger;\nconst é = 'ü'; debugger;\n",
  'src/strict/locked.ts': '/* eslint-disable */\ndebugger;\nexport const foo = 1;\n',
  'src/[id].ts': 'debugger;\n',
  'src/bridged.ts':
    '// eslint-disable-next-line local/no-foo\nexport const foo = 1;\nexport const bar = foo;\n',
  'src/separators.ts': "export const s = 'a\u2028b';\r\ndebugger;\rdebugger;\n",
  'src/oxlint-directive.ts': '// oxlint-disable-next-line no-debugger\ndebugger;\n',
  'src/bom.ts': '\uFEFFconst x = 1; debugger;\nexport { x };\n',
};

let root: string;
let results: readonly LintResult[];

function messagesOf(relativePath: string) {
  const result = results.find((entry) => entry.filePath === path.join(root, relativePath));
  return (result?.messages ?? []).map(({ ruleId, line, column }) => ({ ruleId, line, column }));
}

beforeAll(async () => {
  root = createProject('nitpicker-oxlint-test-', { 'policy.mjs': POLICY, ...SOURCES });
  results = await lintProject({ root, patterns: ['src/**/*.ts'] });
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('lintWithOxlint', () => {
  it('runs the atomic-update code-path rule through the existing engine', () => {
    expect(messagesOf('src/atomic.ts')).toEqual([
      { ruleId: 'nitpicker/require-atomic-updates', line: 1, column: 45 },
    ]);
    expect(messagesOf('src/atomic-local.ts')).toEqual([]);
  });

  it.each([
    [
      'honors disable comments and reports columns in UTF-16 units like ESLint',
      'src/plain.ts',
      [{ ruleId: 'no-debugger', line: 3, column: 16 }],
    ],
    [
      'applies disable comments to rules loaded from ESLint plugins',
      'src/bridged.ts',
      [{ ruleId: 'local/no-foo', line: 3, column: 20 }],
    ],
    [
      'ignores oxlint disable comments, which ESLint would not honor',
      'src/oxlint-directive.ts',
      [{ ruleId: 'no-debugger', line: 2, column: 1 }],
    ],
    [
      'lints files whose names contain glob characters',
      'src/[id].ts',
      [{ ruleId: 'no-debugger', line: 1, column: 1 }],
    ],
  ])('%s', (_name, file, expected) => {
    expect(messagesOf(file)).toEqual(expected);
  });

  it('ignores disable comments where the config locks inline configuration, and says so', () => {
    expect(messagesOf('src/strict/locked.ts')).toEqual([
      { ruleId: undefined, line: 1, column: 1 },
      { ruleId: 'no-debugger', line: 2, column: 1 },
      { ruleId: 'local/no-foo', line: 3, column: 14 },
    ]);
  });

  it('reports the message id the ESLint rule used', () => {
    const locked = firstOf(
      results.filter((entry) => entry.filePath === path.join(root, 'src/strict/locked.ts')),
    );
    expect(
      firstOf(locked.messages.filter((message) => message.ruleId === 'local/no-foo')).messageId,
    ).toBe('foo');
  });

  it('counts lines and columns the way ESLint does', () => {
    expect(messagesOf('src/separators.ts')).toEqual([
      { ruleId: 'no-debugger', line: 3, column: 1 },
      { ruleId: 'no-debugger', line: 4, column: 1 },
    ]);
    expect(messagesOf('src/bom.ts')).toEqual([{ ruleId: 'no-debugger', line: 1, column: 14 }]);
  });
});

const TYPED_SOURCE =
  'declare const maybe: string | null;\nexport const needed = maybe as string;\ndeclare const sure: string;\nexport const redundant = sure as string;\n';

describe('lintWithOxlint with type-aware rules', () => {
  let typedRoot: string;
  let typedResults: readonly LintResult[];

  beforeAll(async () => {
    typedRoot = createProject('nitpicker-oxlint-typed-test-', {
      'policy.mjs': TYPED_POLICY,
      'tsconfig.nitpicker.json': JSON.stringify({
        compilerOptions: { strict: true, skipLibCheck: true, types: [], lib: ['ES2022'] },
        include: ['src/**/*.ts'],
      }),
      'src/sub/tsconfig.json': JSON.stringify({
        compilerOptions: { strict: false, types: [], lib: ['ES2022'] },
      }),
      'src/top.ts': TYPED_SOURCE,
      'src/sub/nested.ts': TYPED_SOURCE,
    });
    typedResults = await lintProject({
      root: typedRoot,
      patterns: ['src/**/*.ts'],
      projectConfigName: 'tsconfig.nitpicker.json',
    });
  });

  afterAll(() => {
    rmSync(typedRoot, { recursive: true, force: true });
  });

  it('checks every file against the lint config, not a nested tsconfig.json', () => {
    const lines = (relativePath: string) =>
      typedResults
        .find((entry) => entry.filePath === path.join(typedRoot, relativePath))
        ?.messages.map(({ ruleId, line }) => ({ ruleId, line }));
    const expected = [{ ruleId: '@typescript-eslint/no-unnecessary-type-assertion', line: 4 }];

    expect(lines('src/top.ts')).toEqual(expected);
    expect(lines('src/sub/nested.ts')).toEqual(expected);
  });
});

describe('lintWithOxlint with rule options oxlint rejects', () => {
  let rejectedRoot: string;
  let rejectedResults: readonly LintResult[];
  let policyLoads: number;
  let oxlintRejected: readonly string[];

  beforeAll(async () => {
    rejectedRoot = createProject('nitpicker-oxlint-rejected-', {
      'policy.mjs': `import { appendFileSync } from 'node:fs';
import path from 'node:path';
import tseslint from ${JSON.stringify(import.meta.resolve('typescript-eslint'))};

appendFileSync(path.join(import.meta.dirname, 'policy-loads.txt'), 'loaded\\n');

const local = {
  rules: {
    'no-foo': {
      meta: { type: 'problem', schema: [], messages: { foo: 'No foo.' } },
      create(context) {
        return {
          Identifier(node) {
            if (node.name === 'foo') context.report({ node, messageId: 'foo' });
          },
        };
      },
    },
  },
};

export default [
  {
    files: ['src/**/*.ts'],
    languageOptions: { parser: tseslint.parser },
    plugins: { local },
    rules: { 'local/no-foo': 'error', 'preserve-caught-error': 'error' },
  },
];
`,
      'src/caught.ts': [
        'export function run(task: () => void) {',
        '  try {',
        '    task();',
        '  } catch (error) {',
        "    throw new Error('failed', {});",
        '  }',
        '}',
        'export const foo = 1;',
        '',
      ].join('\n'),
      'eslint-defaults.json': JSON.stringify({
        rules: {
          'preserve-caught-error': ['error', { requireCatchParameter: false, errorClassNames: [] }],
        },
      }),
    });
    rejectedResults = await lintProject({ root: rejectedRoot, patterns: ['src/**/*.ts'] });
    policyLoads = readFileSync(path.join(rejectedRoot, 'policy-loads.txt'), 'utf8')
      .split('\n')
      .filter(Boolean).length;
    const check = spawnSync(
      process.execPath,
      [oxlintBinary(), '--config', 'eslint-defaults.json', 'src/caught.ts'],
      { cwd: rejectedRoot, encoding: 'utf8', timeout: 120_000 },
    );
    oxlintRejected = rejectedRuleIds(
      check.stdout,
      new Map([['preserve-caught-error', 'preserve-caught-error']]),
    );
  });

  afterAll(() => {
    rmSync(rejectedRoot, { recursive: true, force: true });
  });

  it('uses a rule whose ESLint default options oxlint rejects', () => {
    expect(oxlintRejected).toEqual(['preserve-caught-error']);
  });

  it('runs the rule through ESLint and loads the ESLint policy only to plan and lint once', () => {
    expect(firstOf(rejectedResults).messages.map(({ ruleId, line }) => ({ ruleId, line }))).toEqual(
      [
        { ruleId: 'preserve-caught-error', line: 5 },
        { ruleId: 'local/no-foo', line: 8 },
      ],
    );
    expect(policyLoads).toBe(2);
  });
});

describe('lintWithOxlint over many files', () => {
  const FILE_COUNT = 800;
  let manyRoot: string;
  let manyResults: readonly LintResult[];
  let lintProcesses: readonly unknown[];

  beforeAll(async () => {
    manyRoot = createProject('nitpicker-oxlint-many-', {
      'policy.mjs': POLICY,
      ...Object.fromEntries(
        Array.from({ length: FILE_COUNT }, (_file, index) => [
          `src/many/file-${String(index).padStart(3, '0')}.ts`,
          `export const value${String(index)} = 1;\ndebugger;\n`,
        ]),
      ),
    });
    vi.mocked(spawn).mockClear();
    manyResults = await lintProject({ root: manyRoot, patterns: ['src/**/*.ts'] });
    lintProcesses = vi.mocked(spawn).mock.calls.filter(([, args]) => args.includes('--config'));
  });

  afterAll(() => {
    rmSync(manyRoot, { recursive: true, force: true });
  });

  it('splits the files over several oxlint processes', () => {
    expect(lintProcesses).toHaveLength(4);
  });

  it('reports every file once and in path order', () => {
    expect(
      manyResults.map(({ filePath, messages }) => [
        path.relative(manyRoot, filePath),
        messages.map(({ ruleId, line }) => `${String(ruleId)}:${String(line)}`),
      ]),
    ).toEqual(
      Array.from({ length: FILE_COUNT }, (_file, index) => [
        `src/many/file-${String(index).padStart(3, '0')}.ts`,
        ['no-debugger:2'],
      ]),
    );
  });
});
