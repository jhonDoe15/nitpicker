import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { HEAD_POLICY_ENV } from '../../../../../shared/head-policy.mjs';
import { fieldOf, listOf, textOf } from '../../../../../shared/values/readers.mts';
import { LINT_CONFIG } from '../../../preset/test-environment/resolve-environment.mts';
import { runLintEngine } from '../lint-engine.mts';
import { headPolicyFor, temporaryProjects } from '../test-support/layered-project.mts';
import {
  RULE_CRASHED,
  nextRuleCrash,
  ruleCrashNotes,
  skippedFileArguments,
} from './rule-crashes.mts';

const ROOT = path.resolve('/work/project');
const CRASH_OUTPUT = [
  'Oops! Something went wrong! :(',
  '',
  'ESLint: 10.9.1',
  '',
  'TypeError: PROPERTY_CHECKS[key] is not a function',
  `Occurred while linting ${path.join(ROOT, 'lib', 'app.js')}:2`,
  'Rule: "nitpicker/no-orm-query-logging"',
  '    at Property (file:///rules/no-orm-query-logging.mjs:144:43)',
].join('\n');
const CRASHED = {
  file: 'lib/app.js',
  rule: 'nitpicker/no-orm-query-logging',
  error: 'TypeError: PROPERTY_CHECKS[key] is not a function',
};

function crashRun(stderr: string, status = 2) {
  return { status, signal: undefined, error: undefined, stdout: '', stderr };
}

describe('nextRuleCrash', () => {
  it('names the file, the rule and the error of a rule that crashed', () => {
    expect(nextRuleCrash(crashRun(CRASH_OUTPUT), ROOT, [])).toEqual(CRASHED);
  });

  it('does not skip a file twice, a file outside the project or a run that did not crash', () => {
    expect(nextRuleCrash(crashRun(CRASH_OUTPUT), ROOT, [CRASHED])).toBeUndefined();
    expect(nextRuleCrash(crashRun(CRASH_OUTPUT), path.join(ROOT, 'other'), [])).toBeUndefined();
    expect(nextRuleCrash(crashRun(CRASH_OUTPUT, 1), ROOT, [])).toBeUndefined();
    expect(nextRuleCrash(crashRun('Oops! Something went wrong! :('), ROOT, [])).toBeUndefined();
  });

  it('skips a project file whose name starts with two dots', () => {
    const output = CRASH_OUTPUT.replace(
      path.join(ROOT, 'lib', 'app.js'),
      path.join(ROOT, '..app.js'),
    );
    expect(nextRuleCrash(crashRun(output), ROOT, [])).toEqual({ ...CRASHED, file: '..app.js' });
  });

  it('stops skipping files after five crashes', () => {
    const skipped = ['a', 'b', 'c', 'd', 'e'].map((name) => ({ ...CRASHED, file: `${name}.js` }));
    expect(nextRuleCrash(crashRun(CRASH_OUTPUT), ROOT, skipped)).toBeUndefined();
  });
});

describe('skippedFileArguments', () => {
  it('ignores each skipped file with its glob characters escaped', () => {
    expect(skippedFileArguments([])).toEqual([]);
    expect(skippedFileArguments([{ ...CRASHED, file: 'src/[id]/page.js' }])).toEqual([
      '--no-warn-ignored',
      '--ignore-pattern',
      String.raw`src/\[id\]/page.js`,
    ]);
  });
});

describe('ruleCrashNotes', () => {
  it('adds one descriptive note per crashed rule and file', () => {
    expect(ruleCrashNotes([CRASHED, CRASHED], 'eslint-lint')).toEqual([
      {
        tool: 'eslint-lint',
        rule: RULE_CRASHED,
        path: 'lib/app.js',
        identity: `${RULE_CRASHED}:nitpicker/no-orm-query-logging`,
        message:
          'ESLint rule nitpicker/no-orm-query-logging crashed on lib/app.js (TypeError: PROPERTY_CHECKS[key] ' +
          'is not a function), so this file was not linted by any rule; the other files were linted. ' +
          'The crash is a bug in the rule, not a problem in this code.',
        classification: 'descriptive',
      },
    ]);
  });
});

const TSESLINT = JSON.stringify(import.meta.resolve('typescript-eslint'));
const POLICY = `import tseslint from ${TSESLINT};
const boom = {
  meta: { type: 'problem', schema: [], messages: { foo: 'No foo.' } },
  create(context) {
    return {
      Property(node) {
        if (node.key.name === '__proto__') throw new TypeError('lookup is not a function');
      },
      Identifier(node) {
        if (node.name === 'foo') context.report({ node, messageId: 'foo' });
      },
    };
  },
};
export default [
  { files: ['src/**/*.ts'], languageOptions: { parser: tseslint.parser }, plugins: { x: { rules: { boom } } }, rules: { 'x/boom': 'error' } },
];
`;

describe('runLintEngine with a crashing rule', () => {
  const projects = temporaryProjects();
  afterAll(() => {
    projects.remove();
  });

  it('lints the other files and reports the file the rule crashed on', async () => {
    const root = projects.create({
      'policy.mjs': POLICY,
      'src/base.ts': 'export function create(base: object) {\n  return { __proto__: base };\n}\n',
      'src/foo.ts': 'export const foo = 1;\n',
    });
    const directory = await mkdtemp(path.join(tmpdir(), 'nitpicker-rule-crash-policy-'));
    try {
      const policy = headPolicyFor({ engine: 'eslint', liveProjectRoot: root });
      await writeFile(path.join(directory, 'policy.json'), JSON.stringify(policy));
      vi.stubEnv(HEAD_POLICY_ENV, path.join(directory, 'policy.json'));
      const { results, crashes } = await runLintEngine({
        options: {
          projectRoot: root,
          liveProjectRoot: root,
          configRelativePath: LINT_CONFIG,
          patterns: ['src/**/*.ts'],
          timeoutMs: 120_000,
          environment: {},
        },
        policyConfigPath: path.join(root, 'policy.mjs'),
      });
      const linted = listOf(results).map((result) =>
        path.relative(root, textOf(fieldOf(result, 'filePath'))).replaceAll('\\', '/'),
      );
      expect(linted).toEqual(['src/foo.ts']);
      expect(crashes).toEqual([
        { file: 'src/base.ts', rule: 'x/boom', error: 'TypeError: lookup is not a function' },
      ]);
    } finally {
      vi.unstubAllEnvs();
      await rm(directory, { recursive: true, force: true });
    }
  });
});
