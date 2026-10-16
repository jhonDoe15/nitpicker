import { describe, expect, it } from 'vitest';
import { runCli as nitpickerCli } from '../../cli.mjs';
import { exactText } from '../../diff/reporting/test-support/output-expectations.mjs';
import { commit } from '../../diff/git/test-support/git-repository.mjs';
import {
  unusedFieldMessage,
  useGradleFixtures,
  useMavenFixtures,
} from './test-support/java-cli-harness.mjs';
import { writeFiles } from '../../diff/git/test-support/fixture-files.mjs';

describe.each([
  ['a Gradle build', useGradleFixtures],
  ['a Maven build', useMavenFixtures],
])('nitpicker with "preset": "java" and a legacy inventory on %s', (_name, useFixtures) => {
  const { repository, run } = useFixtures(nitpickerCli);
  const site = (name, count) => ({
    file: 'src/main/java/demo/A.java',
    rule: 'UnusedPrivateField',
    source: `fp:nitpicker/subject=Avoid unused field: ${name}`,
    count,
  });
  const inventory = (...sites) => `${JSON.stringify({ sites })}\n`;
  it('baselines a site the inventory allows and still fails an unlisted one', () => {
    const root = repository({ 'nitpicker.legacy.json': inventory(site('added', 1)) });
    writeFiles(root, {
      'violations.txt': 'Avoid unused field: legacy\nAvoid unused field: added\n',
    });
    commit(root, 'add a baselined violation');
    expect(run(root).exitCode).toBe(0);

    writeFiles(root, {
      'violations.txt':
        'Avoid unused field: legacy\nAvoid unused field: added\nAvoid unused field: other\n',
    });
    commit(root, 'add an unlisted violation');
    const result = run(root);
    expect({ exitCode: result.exitCode, output: result.text }).toEqual({
      exitCode: 1,
      output: expect.stringMatching(exactText`Base: comparison-base (argument)

Quality gate summary
✖ 1 new enforceable violation
  pmd/UnusedPrivateField src/main/java/demo/A.java:5
    ${unusedFieldMessage('other')}
Full diagnostics: /tmp/nitpicker-java-out-${/[A-Za-z0-9]{6}/}/reports/report.txt
`),
    });
    expect(result.json('new-findings.json')).toEqual([
      {
        tool: 'pmd',
        rule: 'UnusedPrivateField',
        path: 'src/main/java/demo/A.java',
        identity: 'fp:nitpicker/subject=Avoid unused field: other',
        message: unusedFieldMessage('other'),
        classification: 'enforceable',
        location: { line: 5 },
      },
    ]);
  });
  it('fails with baseline-expansion when head raises an allowance over base', () => {
    const root = repository({ 'nitpicker.legacy.json': inventory(site('legacy', 1)) });
    writeFiles(root, { 'nitpicker.legacy.json': inventory(site('legacy', 2)) });
    commit(root, 'raise the allowance');

    const result = run(root);

    expect({ exitCode: result.exitCode, output: result.text }).toEqual({
      exitCode: 1,
      output: expect.stringMatching(exactText`Base: comparison-base (argument)

Quality gate summary
✖ 1 new enforceable violation
  java/baseline-expansion src/main/java/demo/A.java
    Legacy allowance increased from 1 to 2 for UnusedPrivateField
Full diagnostics: /tmp/nitpicker-java-out-${/[A-Za-z0-9]{6}/}/reports/report.txt
`),
    });
    expect(result.json('new-findings.json')).toEqual([
      {
        tool: 'java',
        rule: 'baseline-expansion',
        path: 'src/main/java/demo/A.java',
        identity: 'site:b9e81f40e951757c28a763fd',
        message: 'Legacy allowance increased from 1 to 2 for UnusedPrivateField',
        classification: 'enforceable',
      },
    ]);
  });
  it('honours a custom inventory path from "legacyInventory"', () => {
    const root = repository({
      'nitpicker.config.json': '{ "preset": "java", "legacyInventory": "config/legacy.json" }\n',
      'config/legacy.json': inventory(site('added', 1)),
    });
    writeFiles(root, {
      'violations.txt': 'Avoid unused field: legacy\nAvoid unused field: added\n',
    });
    commit(root, 'add a baselined violation');

    expect(run(root).exitCode).toBe(0);
  });
  it('treats a new inventory entry on head as an expansion', () => {
    const root = repository();
    writeFiles(root, {
      'violations.txt': 'Avoid unused field: legacy\nAvoid unused field: added\n',
      'nitpicker.legacy.json': inventory(site('added', 1)),
    });
    commit(root, 'baseline a new violation by editing the inventory');

    const result = run(root);

    expect(result.exitCode).toBe(1);
    expect(result.json('new-findings.json')).toEqual([
      {
        tool: 'java',
        rule: 'baseline-expansion',
        path: 'src/main/java/demo/A.java',
        identity: 'site:641b8b393b3df93c1ab9d0f7',
        message: 'Legacy allowance increased from 0 to 1 for UnusedPrivateField',
        classification: 'enforceable',
      },
    ]);
  });
});
