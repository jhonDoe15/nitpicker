import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { runCli as nitpickerCli } from '../../cli.mjs';
import { exactText } from '../../diff/reporting/test-support/output-expectations.mjs';
import { commit, fixtureGit } from '../../diff/git/test-support/git-repository.mjs';
import { useGradleFixtures } from './test-support/java-cli-harness.mjs';
import { writeFiles } from '../../diff/git/test-support/fixture-files.mjs';

const { gradleRepository, run, runCli, temporaryRoot } = useGradleFixtures(nitpickerCli);

const addedFieldOutput = expect.stringMatching(exactText`Base: comparison-base (argument)

Quality gate summary
✖ 1 new enforceable violation
  pmd/UnusedPrivateField src/main/java/demo/A.java:4
    Avoid unused field: added
Full diagnostics: /tmp/nitpicker-java-out-${/[A-Za-z0-9]{6}/}/reports/report.txt
`);

describe('nitpicker with "preset": "java"', () => {
  it('passes when the change adds no finding and keeps the legacy one baselined', () => {
    const root = gradleRepository();
    writeFiles(root, {
      'src/main/java/demo/A.java': 'package demo;\n\n\n\npublic final class A {}\n',
    });
    commit(root, 'move only');

    const result = run(root);

    expect(result.exitCode, result.text).toBe(0);
    expect(result.json('summary.json').tools.map(({ name }) => name)).toEqual(['java']);
  });
  it('fails on a new enforceable finding and reports it in text, JSON, SARIF and JUnit', () => {
    const root = gradleRepository();
    writeFiles(root, {
      'violations.txt': 'Avoid unused field: legacy\nAvoid unused field: added\n',
    });
    commit(root, 'add violation');

    const result = run(root, [], { subprocess: true });

    expect({ exitCode: result.exitCode, output: result.text }).toEqual({
      exitCode: 1,
      output: addedFieldOutput,
    });
    expect(result.output.out).toEqual(addedFieldOutput);
    expect(result.json('new-findings.json')).toEqual([
      {
        tool: 'pmd',
        rule: 'UnusedPrivateField',
        path: 'src/main/java/demo/A.java',
        identity: 'fp:nitpicker/subject=Avoid unused field: added',
        message: 'Avoid unused field: added',
        classification: 'enforceable',
        location: { line: 4 },
      },
    ]);
    expect(readFileSync(path.join(result.reports, 'report.sarif'), 'utf8')).toEqual(
      expect.stringMatching(exactText`{
  "$schema": "https://json.schemastore.org/sarif-2.1.0.json",
  "version": "2.1.0",
  "runs": [
    {
      "tool": {
        "driver": {
          "name": "nitpicker",
          "informationUri": "https://github.com/jhonDoe15/nitpicker",
          "rules": [
            {
              "id": "pmd/UnusedPrivateField",
              "name": "UnusedPrivateField"
            }
          ]
        }
      },
      "invocations": [
        {
          "executionSuccessful": true,
          "toolExecutionNotifications": []
        }
      ],
      "results": [
        {
          "ruleId": "pmd/UnusedPrivateField",
          "level": "error",
          "message": {
            "text": "Avoid unused field: added"
          },
          "locations": [
            {
              "physicalLocation": {
                "artifactLocation": {
                  "uri": "src/main/java/demo/A.java"
                },
                "region": {
                  "startLine": 4
                }
              }
            }
          ],
          "partialFingerprints": {
            "nitpickerIdentity/v1": "${/[a-f0-9]{64}/}"
          }
        }
      ]
    }
  ]
}
`),
    );
    expect(readFileSync(path.join(result.reports, 'report.junit.xml'), 'utf8')).toEqual(
      expect.stringMatching(exactText`<?xml version="1.0" encoding="UTF-8"?>
<testsuite name="quality.diff" tests="2" failures="1" errors="0" time="${/[0-9]+(?:\.[0-9]+)?/}">
  <testcase classname="quality.diff" name="java" time="${/[0-9]+(?:\.[0-9]+)?/}"></testcase>
  <testcase classname="quality.diff.new-findings" name="pmd/UnusedPrivateField src/main/java/demo/A.java:4" time="${/[0-9]+(?:\.[0-9]+)?/}"><failure message="Avoid unused field: added" type="pmd/UnusedPrivateField">Avoid unused field: added</failure></testcase>
</testsuite>
`),
    );
  });
  it('honours exclude from nitpicker.config.json', () => {
    const root = gradleRepository();
    writeFiles(root, {
      'nitpicker.config.json': '{ "preset": "java", "exclude": ["src/main/java/demo/**"] }\n',
      'violations.txt': 'Avoid unused field: legacy\nAvoid unused field: added\n',
    });
    commit(root, 'add violation in an excluded path');

    const result = run(root);

    expect(result.exitCode, result.text).toBe(0);
    expect(result.json('new-findings.json')).toEqual([]);
  });
  it('fails a newly added clone', () => {
    const body = Array.from(
      { length: 12 },
      (_, i) =>
        `    int v${i} = compute(a, b) + ${i} * helper(a);\n    if (v${i} > 10) { total += v${i}; }`,
    ).join('\n');
    const source = (name) =>
      `package demo;\n\npublic final class ${name} {\n  int run(int a, int b) {\n    int total = 0;\n${body}\n    return total;\n  }\n}\n`;
    const root = gradleRepository({ 'src/main/java/demo/First.java': source('First') });
    writeFiles(root, { 'src/main/java/demo/Second.java': source('Second') });
    commit(root, 'copy the class');

    const result = run(root);

    expect({ exitCode: result.exitCode, output: result.text }).toEqual({
      exitCode: 1,
      output: expect.stringMatching(exactText`Base: comparison-base (argument)

Quality gate summary
✖ 1 new enforceable violation
  duplicates/duplicate-clone src/main/java/demo/First.java:3
    This code repeats src/main/java/demo/Second.java:3 (30 lines). Keep one copy and call it from both places.
Full diagnostics: /tmp/nitpicker-java-out-${/[A-Za-z0-9]{6}/}/reports/report.txt
`),
    });
    const clones = result
      .json('new-findings.json')
      .filter((finding) => finding.rule === 'duplicate-clone');
    expect(clones).toEqual([
      {
        tool: 'duplicates',
        rule: 'duplicate-clone',
        path: 'src/main/java/demo/First.java',
        identity:
          'pair:src/main/java/demo/First.java|src/main/java/demo/Second.java:fragment:41aa749b80d76291fc31cc1b:occurrence:1',
        message:
          'This code repeats src/main/java/demo/Second.java:3 (30 lines). Keep one copy and call it from both places.',
        classification: 'enforceable',
        location: { line: 3 },
      },
    ]);
  });
  it('reports a Gradle failure on head as a tool error with exit 2 instead of throwing', () => {
    const root = gradleRepository();
    writeFiles(root, { GRADLE_FAIL: 'Execution failed for task :compileJava\n' });
    fixtureGit(root, ['rm', '-q', 'violations.txt']);
    commit(root, 'break the build');

    const result = run(root);

    expect(result.exitCode).toBe(2);
    expect(result.output.err).toBe('');
    expect(result.json('summary.json').overallStatus).toBe('tool-error');
    expect(result.json('tool-errors.json')).toEqual([
      {
        tool: 'java',
        snapshot: 'head',
        rule: 'gradle-failure',
        path: '.',
        message: 'Java preset failed in head: Execution failed for task :compileJava',
      },
    ]);
  });
  it('reports a missing gradle binary as a tool error', () => {
    vi.stubEnv('NITPICKER_GRADLE', path.join(temporaryRoot('nitpicker-java-none-'), 'no-gradle'));
    const root = gradleRepository();

    const result = run(root);

    expect(result.exitCode).toBe(2);
    expect(result.json('tool-errors.json')[0]).toEqual({
      tool: 'java',
      snapshot: 'base',
      rule: 'gradle-failure',
      path: '.',
      message: expect.stringMatching(
        exactText`spawnSync /tmp/nitpicker-java-none-${/[A-Za-z0-9]{6}/}/no-gradle ENOENT`,
      ),
    });
  });
  it('gates a snapshot with --all', () => {
    const root = gradleRepository();
    const reports = path.join(temporaryRoot('nitpicker-java-snapshot-'), 'reports');
    const out = { text: '' };

    const exitCode = runCli({
      arguments_: ['--all', '--output', reports],
      environment: { NO_COLOR: '1' },
      currentProjectRoot: root,
      stdout: { write: (value) => (out.text += value) },
      stderr: { write: () => undefined },
    });

    expect(exitCode).toBe(1);
    expect(out.text).toEqual(
      [
        'Nitpicker quality snapshot',
        'Status: violations',
        'Enforceable findings: 1',
        'Descriptive findings: 0',
        'Tool errors: 0',
        '',
        'Per-tool counts:',
        'java: total=1 enforceable=1 descriptive=0',
        '',
        'Enforceable findings:',
        'pmd/UnusedPrivateField src/main/java/demo/A.java:3 Avoid unused field: legacy',
        '',
      ].join('\n'),
    );
  });
});
