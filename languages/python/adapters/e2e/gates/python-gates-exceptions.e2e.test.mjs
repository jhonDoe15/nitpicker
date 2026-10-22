import path from 'node:path';
import { readdirSync, readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { acceptedDigest } from '../../../../../core/command/test-support/accepted-digest.mjs';
import { ONE_WAY_VIOLATIONS } from '../test-support/python-preset-data.mjs';
import {
  commitBranch,
  fixtureRepository,
  gate,
  git,
  pythonE2eEnabled,
  removeRepositories,
} from '../test-support/python-e2e-support.mjs';
import {
  GATE_PACKAGES,
  enforceable,
  withoutMutants,
} from '../test-support/python-gate-support.mjs';

const EXCEPTING_CONFIG = JSON.stringify({
  preset: 'python',
  disable: ['mutation'],
  python: {
    exceptions: [
      { rule: 'PTH118', paths: ['src/demo/rules.py'], reason: 'fixture' },
      { rule: 'frozen-dataclass', paths: ['src/demo/*.py'], reason: 'fixture' },
      { rule: 'no-inline-suppression', paths: ['src/**'], reason: 'fixture' },
    ],
  },
});

const EXCEPTION_LOOSENINGS = [
  'analyzer disabled: mutation',
  'exception added: frozen-dataclass for src/demo/*.py (fixture)',
  'exception added: no-inline-suppression for src/** (fixture)',
  'python.exceptions for PTH118 hide code this change adds or moves where the base config checked it: src/demo/rules.py',
  'python.exceptions for frozen-dataclass hide code this change adds or moves where the base config checked it: src/demo/rules.py',
  'python.exceptions for no-inline-suppression hide code this change adds or moves where the base config checked it: src/demo/rules.py',
];

function sourcePython(root) {
  return readdirSync(path.join(root, 'src'), { recursive: true })
    .filter((file) => file.endsWith('.py') && !file.includes('__pycache__'))
    .map((file) => `src/${file}`);
}

describe.skipIf(!pythonE2eEnabled)('Python preset one-way rules and exceptions end to end', () => {
  let project;
  beforeAll(() => {
    project = fixtureRepository(GATE_PACKAGES);
    commitBranch(project, 'one-way', { 'src/demo/rules.py': ONE_WAY_VIOLATIONS });
    commitBranch(project, 'excepted', {
      'src/demo/rules.py': ONE_WAY_VIOLATIONS,
      'nitpicker.config.json': EXCEPTING_CONFIG,
    });
  });
  afterAll(removeRepositories);
  it('fails the one-way rules, each message naming the allowed form', () => {
    const result = gate(project, 'one-way');

    expect(result.exitCode, result.text).toBe(1);
    expect(withoutMutants(enforceable(result))).toEqual([
      'python-rules frozen-dataclass rules.py',
      'python-rules no-inline-suppression rules.py',
      'ruff PTH118 rules.py',
    ]);
    expect(/Declare records as `@dataclass\(frozen=True\)`/.test(result.text), result.text).toBe(
      true,
    );
    expect(/Use `pathlib\.Path`/.test(result.text), result.text).toBe(true);
    expect(/Remove the comment and fix the code/.test(result.text), result.text).toBe(true);
    expect(
      /add \{"rule":"PTH118","paths":\["src\/demo\/rules\.py"\],"reason":"..."\} to "python\.exceptions" in nitpicker\.config\.json\./.test(
        result.text,
      ),
      result.text,
    ).toBe(true);
  });
  it('fails the exceptions that hide checked code until a person accepts exactly those loosenings', () => {
    const result = gate(project, 'excepted');

    expect(result.exitCode, result.text).toBe(1);
    expect(
      result
        .json('new-findings.json')
        .filter(({ classification }) => classification === 'enforceable')
        .map(({ tool, rule, identity }) => ({ tool, rule, identity }))
        .sort((left, right) => left.identity.localeCompare(right.identity)),
    ).toEqual(
      EXCEPTION_LOOSENINGS.toSorted((left, right) => left.localeCompare(right)).map((identity) => ({
        tool: 'nitpicker-config',
        rule: 'policy-loosened',
        identity,
      })),
    );
  });
  it('passes the same code when exceptions lift its rules', () => {
    git(project, 'checkout', '-q', 'excepted');
    const digest = acceptedDigest(EXCEPTION_LOOSENINGS, {
      'nitpicker.config.json': EXCEPTING_CONFIG,
      ...Object.fromEntries(
        sourcePython(project).map((file) => [file, readFileSync(path.join(project, file), 'utf8')]),
      ),
    });
    const result = gate(project, 'excepted', {
      environment: { CI: 'true', NITPICKER_ACCEPT_POLICY_CHANGE: digest },
    });

    expect(result.exitCode, result.text).toBe(0);
    expect(withoutMutants(enforceable(result))).toEqual([]);
    expect(result.json('summary.json').configOverrides).toEqual([
      'preset: "python"',
      'disable: ["mutation"]',
      'exception: {"rule":"PTH118","paths":["src/demo/rules.py"],"reason":"fixture"}',
      'exception: {"rule":"frozen-dataclass","paths":["src/demo/*.py"],"reason":"fixture"}',
      'exception: {"rule":"no-inline-suppression","paths":["src/**"],"reason":"fixture"}',
    ]);
  });
});
