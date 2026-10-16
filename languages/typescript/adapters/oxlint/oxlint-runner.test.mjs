import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { oxlintBinary } from './oxlint-process.mjs';
import { rejectedRuleIds } from './oxlint-translation.mjs';
import { createProject, lintProject, TYPED_POLICY } from './test-support/oxlint-project.mjs';

const POLICY = `import tseslint from ${JSON.stringify(import.meta.resolve('typescript-eslint'))};

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
    rules: {
      'no-debugger': 'error',
      'no-irregular-whitespace': 'error',
      'local/no-foo': 'error',
    },
  },
  { files: ['src/strict/**/*.ts'], linterOptions: { noInlineConfig: true } },
];
`;

const SOURCES = {
  'src/plain.ts': "// eslint-disable-next-line no-debugger\ndebugger;\nconst é = 'ü'; debugger;\n",
  'src/strict/locked.ts': '/* eslint-disable */\ndebugger;\nexport const foo = 1;\n',
  'src/[id].ts': 'debugger;\n',
  'src/bridged.ts':
    '// eslint-disable-next-line local/no-foo\nexport const foo = 1;\nexport const bar = foo;\n',
  'src/separators.ts': "export const s = 'a\u2028b';\r\ndebugger;\rdebugger;\n",
  'src/oxlint-directive.ts': '// oxlint-disable-next-line no-debugger\ndebugger;\n',
  'src/bom.ts': '\uFEFFconst x = 1; debugger;\nexport { x };\n',
};

let root;
let results;

function messagesOf(relativePath) {
  const result = results.find((entry) => entry.filePath === path.join(root, relativePath));
  return (result?.messages ?? []).map(({ ruleId, line, column }) => ({ ruleId, line, column }));
}

beforeAll(() => {
  root = createProject('nitpicker-oxlint-test-', { 'policy.mjs': POLICY, ...SOURCES });
  results = lintProject({ root, patterns: ['src/**/*.ts'] });
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('lintWithOxlint', () => {
  it('honors disable comments and reports columns in UTF-16 units like ESLint', () => {
    expect(messagesOf('src/plain.ts')).toEqual([{ ruleId: 'no-debugger', line: 3, column: 16 }]);
  });

  it('ignores disable comments where the config locks inline configuration, and says so', () => {
    expect(messagesOf('src/strict/locked.ts')).toEqual([
      { ruleId: undefined, line: 1, column: 1 },
      { ruleId: 'no-debugger', line: 2, column: 1 },
      { ruleId: 'local/no-foo', line: 3, column: 14 },
    ]);
  });

  it('reports the message id the ESLint rule used', () => {
    const locked = results.find(
      (entry) => entry.filePath === path.join(root, 'src/strict/locked.ts'),
    );
    expect(locked.messages.find((message) => message.ruleId === 'local/no-foo').messageId).toBe(
      'foo',
    );
  });

  it('applies disable comments to rules loaded from ESLint plugins', () => {
    expect(messagesOf('src/bridged.ts')).toEqual([{ ruleId: 'local/no-foo', line: 3, column: 20 }]);
  });

  it('ignores oxlint disable comments, which ESLint would not honor', () => {
    expect(messagesOf('src/oxlint-directive.ts')).toEqual([
      { ruleId: 'no-debugger', line: 2, column: 1 },
    ]);
  });

  it('counts lines and columns the way ESLint does', () => {
    expect(messagesOf('src/separators.ts')).toEqual([
      { ruleId: 'no-debugger', line: 3, column: 1 },
      { ruleId: 'no-debugger', line: 4, column: 1 },
    ]);
    expect(messagesOf('src/bom.ts')).toEqual([{ ruleId: 'no-debugger', line: 1, column: 14 }]);
  });

  it('lints files whose names contain glob characters', () => {
    expect(messagesOf('src/[id].ts')).toEqual([{ ruleId: 'no-debugger', line: 1, column: 1 }]);
  });
});

const TYPED_SOURCE =
  'declare const maybe: string | null;\nexport const needed = maybe as string;\ndeclare const sure: string;\nexport const redundant = sure as string;\n';

describe('lintWithOxlint with type-aware rules', () => {
  let typedRoot;
  let typedResults;

  beforeAll(() => {
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
    typedResults = lintProject({
      root: typedRoot,
      patterns: ['src/**/*.ts'],
      projectConfigName: 'tsconfig.nitpicker.json',
    });
  });

  afterAll(() => {
    rmSync(typedRoot, { recursive: true, force: true });
  });

  it('checks every file against the lint config, not a nested tsconfig.json', () => {
    const lines = (relativePath) =>
      typedResults
        .find((entry) => entry.filePath === path.join(typedRoot, relativePath))
        ?.messages.map(({ ruleId, line }) => ({ ruleId, line }));
    const expected = [{ ruleId: '@typescript-eslint/no-unnecessary-type-assertion', line: 4 }];

    expect(lines('src/top.ts')).toEqual(expected);
    expect(lines('src/sub/nested.ts')).toEqual(expected);
  });
});

describe('lintWithOxlint with rule options oxlint rejects', () => {
  let rejectedRoot;
  let rejectedResults;
  let policyLoads;
  let oxlintRejected;

  beforeAll(() => {
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
    rejectedResults = lintProject({ root: rejectedRoot, patterns: ['src/**/*.ts'] });
    policyLoads = readFileSync(path.join(rejectedRoot, 'policy-loads.txt'), 'utf8')
      .split('\n')
      .filter(Boolean).length;
    const check = spawnSync(
      process.execPath,
      [oxlintBinary(), '--config', 'eslint-defaults.json', 'src/caught.ts'],
      { cwd: rejectedRoot, encoding: 'utf8' },
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
    expect(rejectedResults[0].messages.map(({ ruleId, line }) => ({ ruleId, line }))).toEqual([
      { ruleId: 'preserve-caught-error', line: 5 },
      { ruleId: 'local/no-foo', line: 8 },
    ]);
    expect(policyLoads).toBe(2);
  });
});

const SCREENED_POLICY = `import tseslint from ${JSON.stringify(import.meta.resolve('typescript-eslint'))};

const local = {
  rules: {
    'no-foo-typed': {
      meta: {
        type: 'problem',
        docs: { requiresTypeChecking: true, typeCheckingOnlyExempts: true },
        schema: [],
        messages: { foo: 'No foo.' },
      },
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
    rules: { 'no-debugger': 'error', 'local/no-foo-typed': 'error' },
  },
];
`;

describe('lintWithOxlint with type-aware rules whose types only exempt', () => {
  const typed = { ruleId: 'local/no-foo-typed', line: 1, column: 1, message: 'Typed foo.' };
  let screenedRoot;
  let candidateRuns;
  let candidateLint;
  let cleanRuns;
  let cleanLint;

  beforeAll(() => {
    screenedRoot = createProject('nitpicker-oxlint-screened-test-', {
      'policy.mjs': SCREENED_POLICY,
      'src/candidate.ts': 'export const foo = 1;\n',
      'src/clean.ts': 'export const bar = 1;\ndebugger;\n',
    });
    candidateRuns = [];
    candidateLint = lintProject({
      root: screenedRoot,
      patterns: ['src/**/*.ts'],
      runEslintCli: (files, environment) => {
        candidateRuns.push({ files, rules: environment.NITPICKER_DIFF_ESLINT_ONLY_RULES });
        return [{ filePath: path.join(screenedRoot, 'src/candidate.ts'), messages: [typed] }];
      },
    });
  });

  beforeAll(() => {
    cleanRuns = [];
    cleanLint = lintProject({
      root: screenedRoot,
      patterns: ['src/clean.ts'],
      runEslintCli: (files) => {
        cleanRuns.push(files);
        return [];
      },
    });
  });

  afterAll(() => {
    rmSync(screenedRoot, { recursive: true, force: true });
  });

  it('runs ESLint only on the files the untyped rule reported and keeps its typed findings', () => {
    expect(candidateRuns).toEqual([
      { files: ['src/candidate.ts'], rules: '["local/no-foo-typed"]' },
    ]);
    expect(
      candidateLint.map(({ filePath, messages }) => [
        path.relative(screenedRoot, filePath),
        messages.map(({ ruleId, line, message }) => ({ ruleId, line, message })),
      ]),
    ).toEqual([
      ['src/candidate.ts', [{ ruleId: 'local/no-foo-typed', line: 1, message: 'Typed foo.' }]],
      ['src/clean.ts', [{ ruleId: 'no-debugger', line: 2, message: expect.any(String) }]],
    ]);
  });

  it('starts no ESLint run when the untyped rule reports nothing', () => {
    expect({
      runs: cleanRuns,
      rules: cleanLint.flatMap(({ messages }) => messages.map(({ ruleId }) => ruleId)),
    }).toEqual({ runs: [], rules: ['no-debugger'] });
  });
});
