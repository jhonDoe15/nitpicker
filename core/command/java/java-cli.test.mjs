import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { runCli as nitpickerCli } from '../../cli.mjs';
import { exactText } from '../../diff/reporting/test-support/output-expectations.mjs';
import { commit, fixtureGit } from '../../diff/git/test-support/git-repository.mjs';
import {
  unusedFieldMessage,
  useGradleFixtures,
  useMavenFixtures,
} from './test-support/java-cli-harness.mjs';
import { writeFiles } from '../../diff/git/test-support/fixture-files.mjs';
import { acceptedDigest } from '../test-support/accepted-digest.mjs';

const addedField = unusedFieldMessage('added');
const xmlText = (text) =>
  text.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');

const addedFieldOutput = expect.stringMatching(exactText`Base: comparison-base (argument)

Quality gate summary
✖ 1 new enforceable violation
  pmd/UnusedPrivateField src/main/java/demo/A.java:4
    ${addedField}
Full diagnostics: /tmp/nitpicker-java-out-${/[A-Za-z0-9]{6}/}/reports/report.txt
`);

describe.each([
  ['a Gradle build', useGradleFixtures],
  ['a Maven build', useMavenFixtures],
])('nitpicker with "preset": "java" on %s', (_name, useFixtures) => {
  const { build, repository, run, runCli, temporaryRoot } = useFixtures(nitpickerCli);
  it('passes when the change adds no finding and keeps the legacy one baselined', () => {
    const root = repository();
    writeFiles(root, {
      'src/main/java/demo/A.java': 'package demo;\n\n\n\npublic final class A {}\n',
    });
    commit(root, 'move only');

    const result = run(root);

    expect(result.exitCode, result.text).toBe(0);
    expect(result.json('summary.json').tools.map(({ name }) => name)).toEqual(['java']);
  });
  it('fails on a new enforceable finding and reports it in text, JSON, SARIF and JUnit', () => {
    const root = repository();
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
        message: addedField,
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
            "text": ${JSON.stringify(addedField)}
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
  <testcase classname="quality.diff.new-findings" name="pmd/UnusedPrivateField src/main/java/demo/A.java:4" time="${/[0-9]+(?:\.[0-9]+)?/}"><failure message="${xmlText(addedField)}" type="pmd/UnusedPrivateField">${xmlText(addedField)}</failure></testcase>
</testsuite>
`),
    );
  });
  it('honours exclude from nitpicker.config.json', () => {
    const root = repository();
    writeFiles(root, {
      'nitpicker.config.json': '{ "preset": "java", "exclude": ["src/main/java/demo/**"] }\n',
      'violations.txt': 'Avoid unused field: legacy\nAvoid unused field: added\n',
    });
    commit(root, 'add violation in an excluded path');

    const digest = acceptedDigest(['exclude added: src/main/java/demo/**'], {
      'nitpicker.config.json': '{ "preset": "java", "exclude": ["src/main/java/demo/**"] }\n',
      'src/main/java/demo/A.java': 'package demo;\n\npublic final class A {}\n',
    });
    const result = run(root, [`--accept-policy-change=${digest}`], { interactive: true });

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
    const root = repository({ 'src/main/java/demo/First.java': source('First') });
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
  it('reports a build failure on head as a tool error with exit 2 instead of throwing', () => {
    const root = repository();
    writeFiles(root, build.failure.files);
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
        rule: build.failure.error.rule,
        path: '.',
        message: build.failure.error.message('head'),
      },
    ]);
  });
  it('reports a build failure on base as a tool error with exit 2', () => {
    const root = repository(build.failure.files);
    fixtureGit(root, ['rm', '-q', ...Object.keys(build.failure.files)]);
    commit(root, 'fix the build');

    const result = run(root);

    expect(result.exitCode).toBe(2);
    expect(result.json('summary.json').overallStatus).toBe('tool-error');
    expect(result.json('tool-errors.json')).toEqual([
      {
        tool: 'java',
        snapshot: 'base',
        rule: build.failure.error.rule,
        path: '.',
        message: build.failure.error.message('base'),
      },
    ]);
  });
  it('lets an exception entry for the rule and path allow a new finding', () => {
    const root = repository();
    writeFiles(root, {
      'nitpicker.config.json': `${JSON.stringify({
        preset: 'java',
        exceptions: [
          {
            rule: 'pmd/UnusedPrivateField',
            paths: ['src/main/java/demo/A.java'],
            reason: 'generated holder',
          },
        ],
      })}\n`,
      'violations.txt': 'Avoid unused field: legacy\nAvoid unused field: added\n',
    });
    commit(root, 'add a violation with an exception');

    const result = run(root);

    expect(result.exitCode, result.text).toBe(0);
    expect(result.json('new-findings.json')).toEqual([]);
  });
  it('reports a missing build tool binary as a tool error', () => {
    const binary = path.join(temporaryRoot('nitpicker-java-none-'), 'no-build-tool');
    vi.stubEnv(build.missingBinary.variable, binary);
    const root = repository();

    const result = run(root);

    expect(result.exitCode).toBe(2);
    expect(result.json('tool-errors.json')[0]).toEqual({
      tool: 'java',
      snapshot: 'base',
      rule: build.missingBinary.rule,
      path: '.',
      message: build.missingBinary.message(binary),
    });
  });
  it('gates a snapshot with --all', () => {
    const root = repository();
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
        `Descriptive findings: ${String(build.descriptive.length)}`,
        'Tool errors: 0',
        '',
        'Per-tool counts:',
        `java: total=${String(1 + build.descriptive.length)} enforceable=1 descriptive=${String(build.descriptive.length)}`,
        '',
        'Enforceable findings:',
        `pmd/UnusedPrivateField src/main/java/demo/A.java:3 ${unusedFieldMessage('legacy')}`,
        '',
        ...(build.descriptive.length === 0
          ? []
          : ['Descriptive findings:', ...build.descriptive, '']),
      ].join('\n'),
    );
  });
});
