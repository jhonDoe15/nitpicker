import { cpSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  BRANCH_CLAMP,
  CLAMP_HIGH,
  CLAMP_LOW,
  PRAGMAS,
  SIGNS,
  SIGN_NEGATIVE,
  SIGN_POSITIVE,
  signsTest,
} from './test-support/python-preset-data.mjs';
import {
  COLORS_DEFAULT,
  COLORS_EXHAUSTIVE,
  COLORS_EXTRA,
  COLORS_OPEN,
  COLORS_TEST,
  LOOKALIKES,
  LOOKALIKES_TEST,
  PORTS,
  PORTS_TEST,
} from './test-support/python-coverage-idioms-data.mjs';
import {
  commitBranch,
  fixture,
  gate,
  initializeRepository,
  installPackages,
  pythonE2eEnabled,
  removeRepositories,
  repository,
  write,
} from './test-support/python-e2e-support.mjs';

describe.skipIf(!pythonE2eEnabled)('Python changed-branch coverage end to end', () => {
  let project;
  const branchFindings = (result) =>
    result
      .json('new-findings.json')
      .filter(({ rule }) => rule === 'changed-branch-coverage')
      .map(({ path: file, location }) => `${file}:${String(location.line)}`);
  beforeAll(() => {
    project = repository();
    cpSync(fixture, project, { recursive: true });
    write(project, {
      'nitpicker.config.json': '{ "preset": "python", "disable": ["mutation"] }\n',
      'src/demo/signs.py': SIGNS,
      'tests/test_signs.py': signsTest(SIGN_POSITIVE),
    });
    initializeRepository(project, 'base with an untested branch in sign');
    installPackages(project, ['-e', '.', 'coverage', 'pytest']);
    commitBranch(project, 'shifted', { 'src/demo/signs.py': `"""Signs."""\n\n\n${SIGNS}` });
    commitBranch(project, 'edited', {
      'src/demo/signs.py': SIGNS.replace('x < 0', 'x <= -1'),
    });
    commitBranch(project, 'edited-and-tested', {
      'src/demo/signs.py': SIGNS.replace('x < 0', 'x <= -1'),
      'tests/test_signs.py': signsTest(SIGN_POSITIVE, SIGN_NEGATIVE),
    });
    commitBranch(project, 'new-untested', {
      'src/demo/signs.py': `${SIGNS}\n\n${BRANCH_CLAMP}`,
      'tests/test_signs.py': signsTest(SIGN_POSITIVE, CLAMP_LOW),
    });
    commitBranch(project, 'pragmas', {
      'src/demo/pragmas.py': PRAGMAS,
      'tests/test_pragmas.py':
        'from demo import pragmas\n\n\ndef test_imported():\n    assert pragmas.hidden\n',
    });
    commitBranch(project, 'new-tested', {
      'src/demo/signs.py': `${SIGNS}\n\n${BRANCH_CLAMP}`,
      'tests/test_signs.py': signsTest(SIGN_POSITIVE, CLAMP_LOW, CLAMP_HIGH),
    });
    commitBranch(project, 'ports', {
      'src/demo/ports.py': PORTS,
      'tests/test_ports.py': PORTS_TEST,
    });
    commitBranch(project, 'lookalikes', {
      'src/demo/lookalikes.py': LOOKALIKES,
      'tests/test_lookalikes.py': LOOKALIKES_TEST,
    });
    for (const [name, source] of Object.entries({
      'colors-open': COLORS_OPEN,
      'colors-exhaustive': COLORS_EXHAUSTIVE,
      'colors-default': COLORS_DEFAULT,
      'colors-extra': COLORS_EXTRA,
    })) {
      commitBranch(project, name, {
        'src/demo/colors.py': source,
        'tests/test_colors.py': COLORS_TEST,
      });
    }
  });
  afterAll(removeRepositories);
  it('keeps an old uncovered branch baselined when its line moves', () => {
    const result = gate(project, 'shifted');

    expect(result.exitCode, result.text).toBe(0);
    expect(branchFindings(result)).toEqual([]);
  });
  it('fails an uncovered branch whose line was edited', () => {
    const result = gate(project, 'edited');

    expect(result.exitCode, result.text).toBe(1);
    expect(branchFindings(result)).toEqual(['src/demo/signs.py:2']);
    expect(result.text).toMatch(
      /Branch coverage is 50\.00%; minimum is 95%\. Not taken: the branch to line 3/,
    );
  });
  it('passes an edited branch once a test takes both outcomes', () => {
    const result = gate(project, 'edited-and-tested');

    expect(result.exitCode, result.text).toBe(0);
  });
  it('fails a new branch no test takes, and leaves the old gap alone', () => {
    const result = gate(project, 'new-untested');

    expect(result.exitCode, result.text).toBe(1);
    expect(branchFindings(result)).toEqual(['src/demo/signs.py:8']);
  });
  it('honors no pragma, but leaves the main guard alone', () => {
    const result = gate(project, 'pragmas');

    expect(branchFindings(result)).toEqual(['src/demo/pragmas.py:5']);
  });
  it('passes a new branch whose outcomes are both tested', () => {
    const result = gate(project, 'new-tested');

    expect(result.exitCode, result.text).toBe(0);
  });
  it('accepts the stubs of a Protocol and of an abstract method', () => {
    const result = gate(project, 'ports');

    expect(branchFindings(result), result.text).toEqual([]);
  });
  it('accepts a match over every enum member that ends in assert_never', () => {
    const result = gate(project, 'colors-exhaustive');

    expect(branchFindings(result), result.text).toEqual([]);
  });
  it('still fails a match with no case for the last enum member', () => {
    const result = gate(project, 'colors-open');

    expect(branchFindings(result)).toEqual(['src/demo/colors.py:14']);
    expect(
      result
        .json('new-findings.json')
        .filter(({ rule }) => rule === 'changed-branch-coverage')
        .map(({ message }) => message),
    ).toEqual([
      'Branch coverage is 50.00%; minimum is 95%. Not taken: no case matching (if the cases cover every value, end the match with `case _:` and `assert_never(subject)`). Test it, or remove it if it can\'t happen. If this is intended, add {"rule":"changed-branch-coverage","paths":["src/demo/colors.py"],"function":"name","reason":"..."} to "exceptions" in nitpicker.config.json.',
    ]);
  });
  it('still fails a default case no test reaches', () => {
    const result = gate(project, 'colors-default');

    expect(branchFindings(result)).toEqual(['src/demo/colors.py:14']);
  });
  it('still fails a wildcard arm that does more than assert_never', () => {
    const result = gate(project, 'colors-extra');

    expect(branchFindings(result)).toEqual(['src/demo/colors.py:14']);
  });
  it('still counts a wrapped condition with an ellipsis body and an assert_never in an else', () => {
    const result = gate(project, 'lookalikes');

    expect(branchFindings(result)).toEqual([
      'src/demo/lookalikes.py:5',
      'src/demo/lookalikes.py:14',
    ]);
  });
});
