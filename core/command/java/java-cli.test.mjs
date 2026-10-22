import { readFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it, vi } from 'vitest';
import { runCli as nitpickerCli } from '../../cli.mjs';
import { exactText } from '../../diff/reporting/test-support/output-expectations.mjs';
import { commit, fixtureGit } from '../../diff/git/test-support/git-repository.mjs';
import {
  gradleFailureMessage,
  unusedFieldMessage,
  useGradleFixtures,
} from './test-support/java-cli-harness.mjs';
import { writeFiles } from '../../diff/git/test-support/fixture-files.mjs';
import { acceptedDigest } from '../test-support/accepted-digest.mjs';

const { gradleRepository, kotlinRepository, run, runCli, temporaryRoot } =
  useGradleFixtures(nitpickerCli);
const EXCEPTION_ENTRY = /\{"rule":"[^"]+","paths":\[[^\]]+\],"reason":"\.\.\."\}/u;
const TEST_REPORTS = {
  'src/test/java/demo/ATest.java': 'package demo;\n\nfinal class ATest {}\n',
  'jdeps/jdeps-classes.txt': 'demo.A\n',
  'jdeps/jdeps.txt': '',
  'jdeps/jdeps-test.txt': '   demo.ATest -> demo.A   classes\n',
  'test-results/test/TEST-demo.ATest.xml':
    '<testsuite name="demo.ATest"><testcase classname="demo.ATest" name="works">' +
    '<system-err>Connection pool leaked a worker thread</system-err></testcase></testsuite>\n',
};
const LIFTABLE_RULES = ['test-only-export', 'test-console-output'];
const addedField = unusedFieldMessage('added');
const xmlText = (text) =>
  text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');

const CLONE_MESSAGE = [
  'This code repeats src/main/java/demo/Second.java:3 (30 lines).',
  'Keep one copy and call it from both places.',
  'If the repetition is intended, add src/main/java/demo/First.java or',
  'src/main/java/demo/Second.java to "exclude" in nitpicker.config.json.',
].join(' ');

const addedFieldOutput = expect.stringMatching(exactText`Base: comparison-base (argument)

Quality gate summary
✖ 1 new enforceable violation
  pmd/UnusedPrivateField src/main/java/demo/A.java:4
    ${addedField}
Full diagnostics: ${tmpdir()}/nitpicker-java-out-${/[A-Za-z0-9]{6}/}/reports/report.txt
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
    expect(result.json('summary.json').tools.map(({ name }) => name)).toEqual([
      'java',
      'repository-hygiene',
    ]);
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
<testsuite name="quality.diff" tests="3" failures="1" errors="0" time="${/[0-9]+(?:\.[0-9]+)?/}">
  <testcase classname="quality.diff" name="java" time="${/[0-9]+(?:\.[0-9]+)?/}"></testcase>
  <testcase classname="quality.diff" name="repository-hygiene" time="${/[0-9]+(?:\.[0-9]+)?/}"></testcase>
  <testcase classname="quality.diff.new-findings" name="pmd/UnusedPrivateField src/main/java/demo/A.java:4" time="${/[0-9]+(?:\.[0-9]+)?/}"><failure message="${xmlText(addedField)}" type="pmd/UnusedPrivateField">${xmlText(addedField)}</failure></testcase>
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
    ${CLONE_MESSAGE}
Full diagnostics: ${tmpdir()}/nitpicker-java-out-${/[A-Za-z0-9]{6}/}/reports/report.txt
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
        message: CLONE_MESSAGE,
        classification: 'enforceable',
        location: { line: 3 },
        ratchet: {
          key: 'pair:src/main/java/demo/First.java|src/main/java/demo/Second.java:clone',
          value: 381,
          divisible: true,
          mustKeepUnchangedLines: [
            { path: 'src/main/java/demo/First.java', startLine: 3, endLine: 32 },
            { path: 'src/main/java/demo/Second.java', startLine: 3, endLine: 32 },
          ],
        },
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
        message: gradleFailureMessage(
          'Java preset failed in head: Execution failed for task :compileJava',
        ),
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
        exactText`Full Gradle log: ${tmpdir()}/nitpicker-gradle-failure-${/[A-Za-z0-9]{6}/}/gradle.log\nspawnSync ${tmpdir()}/nitpicker-java-none-${/[A-Za-z0-9]{6}/}/no-gradle ENOENT`,
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
        'repository-hygiene: total=0 enforceable=0 descriptive=0',
        '',
        'Enforceable findings:',
        `pmd/UnusedPrivateField src/main/java/demo/A.java:3 ${unusedFieldMessage('legacy')}`,
        '',
      ].join('\n'),
    );
  });
});

describe.each([
  ['java', gradleRepository],
  ['kotlin', kotlinRepository],
])('the exception a %s finding message suggests', (preset, repository) => {
  function liftableFindings(root) {
    writeFiles(root, TEST_REPORTS);
    commit(root, 'add a test-only class and console output');
    const result = run(root);
    return {
      result,
      found: result.json('new-findings.json').filter(({ rule }) => LIFTABLE_RULES.includes(rule)),
    };
  }
  it('is accepted by the preset and lifts the finding', () => {
    const { found } = liftableFindings(repository());
    const exceptions = found.map(({ message }) => ({
      ...JSON.parse(EXCEPTION_ENTRY.exec(message)[0]),
      reason: 'Loaded by name from a plugin descriptor of another build.',
    }));
    const config = JSON.parse(readFileSync(path.join(repository(), 'nitpicker.config.json')));

    const { result, found: lifted } = liftableFindings(
      repository({
        'nitpicker.config.json': `${JSON.stringify({ ...config, exceptions })}\n`,
      }),
    );

    expect(found.map(({ rule }) => rule).toSorted()).toEqual(LIFTABLE_RULES.toSorted());
    expect({ exitCode: result.exitCode, lifted }, result.text).toEqual({
      exitCode: 0,
      lifted: [],
    });
    expect(preset).toBe(config.preset);
  });
});
