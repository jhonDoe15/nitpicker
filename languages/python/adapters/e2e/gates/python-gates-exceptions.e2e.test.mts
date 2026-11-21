import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ONE_WAY_VIOLATIONS } from '../test-support/python-preset-data.mts';
import { commitBranch, gate, useRepositories } from '../test-support/python-e2e-support.mts';
import {
  GATE_PACKAGES,
  enforceable,
  pythonExceptionRoute,
  reportedGroups,
  withoutMutants,
} from '../test-support/python-gate-support.mts';

const { fixtureRepository, removeRepositories } = useRepositories();

const pythonE2eEnabled = process.env['NITPICKER_PYTHON_E2E'] === '1';

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

describe.skipIf(!pythonE2eEnabled)('Python preset one-way rules and exceptions end to end', () => {
  let project: string;
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
    expect(reportedGroups(result.text)).toEqual([
      [
        'python-rules/frozen-dataclass: Dataclass Order is not frozen. ' +
          'Declare records as `@dataclass(frozen=True)` and build a changed copy with `dataclasses.replace`.',
        'src/demo/rules.py:6',
        pythonExceptionRoute('frozen-dataclass', 'src/demo/rules.py'),
      ],
      [
        'python-rules/no-inline-suppression: Inline suppression `# noqa: E501`. ' +
          'Remove the comment and fix the code.',
        'src/demo/rules.py:14',
        pythonExceptionRoute('no-inline-suppression', 'src/demo/rules.py'),
      ],
      [
        'ruff/PTH118: `os.path.join()` should be replaced by `Path` with `/` operator. ' +
          'Use `pathlib.Path`: `Path(a) / b`, `path.read_text()`, `path.exists()`.',
        'src/demo/rules.py:11:12',
        pythonExceptionRoute('PTH118', 'src/demo/rules.py'),
      ],
    ]);
  });
  it('passes the same code when exceptions lift its rules', () => {
    const result = gate(project, 'excepted');

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
