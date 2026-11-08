import { readFileSync } from 'node:fs';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import { runCli as nitpickerCli } from '../../../cli.mjs';
import { PACKAGE_ROOT } from '../../../tooling/tool-resolution.mjs';
import { finding, policy } from '../../execution/test-support/analyzer-findings.mjs';
import { captureOutput } from '../test-support/output-capture.mjs';
import { writeFiles } from '../../git/test-support/fixture-files.mjs';
import {
  crashingAnalyzer,
  fakeAnalyzer,
  useCliFixtures,
} from '../../../command/test-support/cli-harness.mjs';

const { createRepository, makeOutputRoot, runCli } = useCliFixtures(nitpickerCli);

const schema = JSON.parse(
  readFileSync(path.join(PACKAGE_ROOT, 'spec', 'json-output.schema.json'), 'utf8'),
);
const validate = new Ajv2020({
  strict: true,
  strictTypes: false,
  strictRequired: false,
  allErrors: true,
}).compile(schema);

const TYPESCRIPT_ROUTE =
  'If this is intended, add {"rule":"nitpicker/no-magic-numbers","paths":["src/main/pricing.ts"],"reason":"..."} to "exceptions" in nitpicker.config.json.';
const PYTHON_ROUTE =
  'If this is intended, add {"rule":"PLR2004","paths":["app/orders.py"],"reason":"..."} to "python.exceptions" in nitpicker.config.json.';

const TOOL_FINDINGS = {
  'eslint-lint': [
    {
      rule: 'nitpicker/no-magic-numbers',
      path: 'src/main/pricing.ts',
      identity: 'typescript-magic-number',
      message: `No magic number: 3. Name it with a module-level constant. ${TYPESCRIPT_ROUTE}`,
      allowedForm: 'Name it with a module-level constant.',
      location: { line: 4, column: 20 },
    },
    {
      rule: 'design-note',
      path: 'src/main/pricing.ts',
      identity: 'descriptive-note',
      message: 'A note that never fails the gate',
      classification: 'descriptive',
    },
  ],
  pmd: [
    {
      rule: 'UnusedPrivateField',
      path: 'src/main/java/shop/Order.java',
      identity: 'java-unused-field',
      message: 'Avoid unused private fields such as \u001B[1mtotal\u001B[0m.',
      location: { line: 7 },
    },
  ],
  ruff: [
    {
      rule: 'PLR2004',
      path: 'app/orders.py',
      identity: 'python-magic-value',
      message: `Magic value used in comparison, consider replacing 3 with a constant variable. ${PYTHON_ROUTE}`,
      location: { line: 2, column: 8 },
    },
  ],
};

const READ_FINDINGS =
  "const fs = require('node:fs'); const file = process.argv[1];" +
  " process.stdout.write(fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '{\"findings\":[]}');";

function toolAnalyzer(name) {
  return {
    ...fakeAnalyzer(name),
    createInvocation({ projectRoot, policyRoot }) {
      return {
        command: process.execPath,
        args: ['-e', READ_FINDINGS, path.join(projectRoot, 'findings', `${name}.json`)],
        cwd: policyRoot,
      };
    },
  };
}

const TOOL_ANALYZERS = Object.keys(TOOL_FINDINGS).map(toolAnalyzer);

const CHANGED_FILES = {
  'src/main/pricing.ts': 'export const price = (qty: number) => qty * 3;\n',
  'src/main/java/shop/Order.java': 'class Order { private int total; }\n',
  'app/orders.py': 'def big(n):\n    return n > 3\n',
  ...Object.fromEntries(
    Object.entries(TOOL_FINDINGS).map(([tool, findings]) => [
      `findings/${tool}.json`,
      JSON.stringify({
        findings: findings.map((entry) => finding({ tool, ...entry })),
      }),
    ]),
  ),
};

const FAILING_FINDINGS = [
  {
    tool: 'eslint-lint',
    rule: 'nitpicker/no-magic-numbers',
    path: 'src/main/pricing.ts',
    line: 4,
    column: 20,
    message: 'No magic number: 3. Name it with a module-level constant.',
    allowedForm: 'Name it with a module-level constant.',
    exception: {
      rule: 'nitpicker/no-magic-numbers',
      paths: ['src/main/pricing.ts'],
      reason: '...',
    },
    helpUri: expect.stringMatching(/^https:\/\/\S+no-magic-numbers/u),
  },
  {
    tool: 'pmd',
    rule: 'UnusedPrivateField',
    path: 'src/main/java/shop/Order.java',
    line: 7,
    message: 'Avoid unused private fields such as total.',
    helpUri: expect.stringMatching(/^https:\/\/\S+/u),
  },
  {
    tool: 'ruff',
    rule: 'PLR2004',
    path: 'app/orders.py',
    line: 2,
    column: 8,
    message: 'Magic value used in comparison, consider replacing 3 with a constant variable.',
    exception: { rule: 'PLR2004', paths: ['app/orders.py'], reason: '...' },
    exceptionList: 'python.exceptions',
    helpUri: expect.stringMatching(/^https:\/\/\S+/u),
  },
];

const CRASH = {
  tool: 'crashing-analyzer',
  headline: expect.stringContaining('crashing-analyzer'),
};

function changedRepository() {
  const repository = createRepository({
    'quality-policy.json': policy(),
    'src/main/clean.ts': 'export const clean = true;\n',
  });
  writeFiles(repository.root, CHANGED_FILES);
  return repository;
}

function runJson(repository, arguments_, overrides = {}) {
  const output = captureOutput();
  const outputRoot = makeOutputRoot();
  const exitCode = runCli({
    arguments_: [...arguments_, '--json', '--output', outputRoot],
    currentProjectRoot: repository.root,
    analyzers: [...TOOL_ANALYZERS, crashingAnalyzer()],
    snapshotAnalyzers: [...TOOL_ANALYZERS, crashingAnalyzer()],
    stdout: output.stdout,
    stderr: output.stderr,
    ...overrides,
  });
  const lines = output.stdoutText.split('\n');
  expect(lines).toHaveLength(2);
  expect(lines[1]).toBe('');
  const result = JSON.parse(lines[0]);
  expect(validate(result), JSON.stringify(validate.errors)).toBe(true);
  return { exitCode, result, outputRoot, stderrText: output.stderrText };
}

function byTool(findings) {
  return findings.toSorted((left, right) => left.tool.localeCompare(right.tool));
}

describe('nitpicker --json', () => {
  it('prints one object with the failing findings and tool errors of a comparison', () => {
    const repository = changedRepository();

    const { exitCode, result, outputRoot, stderrText } = runJson(
      repository,
      ['--base', repository.baseRef],
      { environment: { GITHUB_ACTIONS: 'true' } },
    );

    expect(exitCode).toBe(1);
    expect({ ...result, findings: byTool(result.findings) }).toEqual({
      mode: 'diff',
      status: 'failed',
      exitCode: 1,
      base: { ref: repository.baseRef, source: 'argument' },
      counts: { failing: 3, byArea: { lint: 3 }, reportOnly: 1, held: 0 },
      findings: FAILING_FINDINGS,
      toolErrors: [
        { ...CRASH, snapshot: 'base' },
        { ...CRASH, snapshot: 'head' },
      ],
      reports: path.resolve(outputRoot),
    });
    expect(stderrText).toContain('::error file=src/main/pricing.ts');
    expect(stderrText).not.toContain('Quality gate summary');
  });

  it('prints the findings of --all in the same shape, without base and held counts', () => {
    const repository = changedRepository();

    const { exitCode, result, outputRoot } = runJson(repository, ['--all']);

    expect(exitCode).toBe(1);
    expect({ ...result, findings: byTool(result.findings) }).toEqual({
      mode: 'all',
      status: 'failed',
      exitCode: 1,
      counts: { failing: 3, byArea: { lint: 3 }, reportOnly: 1 },
      findings: FAILING_FINDINGS,
      toolErrors: [{ ...CRASH, snapshot: 'head' }],
      reports: path.resolve(outputRoot),
    });
  });

  it('reports a tool error as status error with exit code 2', () => {
    const repository = createRepository({
      'quality-policy.json': policy(),
      'src/main/clean.ts': 'export const clean = true;\n',
    });
    writeFiles(repository.root, { 'src/main/edited.ts': 'export const edited = true;\n' });

    const { exitCode, result } = runJson(repository, ['--base', repository.baseRef]);

    expect(exitCode).toBe(2);
    expect(result).toMatchObject({
      status: 'error',
      exitCode: 2,
      counts: { failing: 0, byArea: {}, reportOnly: 0, held: 0 },
      findings: [],
      toolErrors: [
        { ...CRASH, snapshot: 'base' },
        { ...CRASH, snapshot: 'head' },
      ],
    });
  });

  it('keeps the gate status and exits 0 with --defer-exit', () => {
    const repository = changedRepository();

    const { exitCode, result } = runJson(
      repository,
      ['--base', repository.baseRef, '--defer-exit'],
      {
        analyzers: TOOL_ANALYZERS,
      },
    );

    expect(exitCode).toBe(0);
    expect(result).toMatchObject({ status: 'failed', exitCode: 0, toolErrors: [] });
  });

  it('marks a change with nothing to check', () => {
    const repository = createRepository({ 'quality-policy.json': policy() });

    const { exitCode, result } = runJson(repository, ['--base', repository.baseRef], {
      analyzers: [fakeAnalyzer()],
    });

    expect(exitCode).toBe(0);
    expect(result).toMatchObject({ status: 'passed', noChanges: true, findings: [] });
  });

  it('prints the error that stops the run as an object', () => {
    const repository = createRepository({ 'quality-policy.json': policy() });

    const { exitCode, result, stderrText } = runJson(repository, ['--bogus']);

    expect(exitCode).toBe(2);
    expect(result).toEqual({
      status: 'error',
      exitCode: 2,
      error: expect.stringContaining('Unknown argument: --bogus'),
    });
    expect(stderrText).toContain('nitpicker failed: Unknown argument: --bogus');
  });
});
