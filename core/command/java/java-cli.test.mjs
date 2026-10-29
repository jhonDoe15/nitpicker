import { readFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
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
import { docsUrl } from '../../../shared/messages/docs-url.mjs';

const EMPTY_JDEPS = { 'jdeps/jdeps.txt': '', 'jdeps/jdeps-classes.txt': '' };
const EXCEPTION_ENTRY = /\{"rule":"[^"]+","paths":\[[^\]]+\],"reason":"\.\.\."\}/u;
const TEST_SOURCE = { 'src/test/java/demo/ATest.java': 'package demo;\n\nfinal class ATest {}\n' };
const TEST_REPORTS = {
  MAIN_CLASSES: '',
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

const UNUSED_FIELD_HELP_URI = docsUrl('docs/rules/java-pmd.md', 'pmd-unusedprivatefield');

const addedFieldOutput = expect.stringMatching(exactText`Base: comparison-base (argument)

Quality gate summary
✖ 1 new enforceable violation
  pmd/UnusedPrivateField src/main/java/demo/A.java:4
    ${addedField}
Full diagnostics: ${tmpdir()}/nitpicker-java-out-${/[A-Za-z0-9]{6}/}/reports/report.txt
`);

describe.each([
  ['a Gradle build', useGradleFixtures, true],
  ['a Maven build', useMavenFixtures, false],
])('nitpicker with "preset": "java" on %s', (_name, useFixtures, subprocess) => {
  const { build, run, runCli, temporaryRoot, ...fixtures } = useFixtures(nitpickerCli);
  const repository = (files = {}) => fixtures.repository({ ...EMPTY_JDEPS, ...files });
  it('passes when the change adds no finding and keeps the legacy one baselined', () => {
    const root = repository();
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
    const root = repository();
    writeFiles(root, {
      'violations.txt': 'Avoid unused field: legacy\nAvoid unused field: added\n',
    });
    commit(root, 'add violation');

    const result = run(root, [], { subprocess });

    expect({ exitCode: result.exitCode, output: result.text }).toEqual({
      exitCode: 1,
      output: addedFieldOutput,
    });
    expect(result.output.out).toEqual(addedFieldOutput);
    expect(
      JSON.parse(readFileSync(path.join(result.reports, 'new-findings.json'), 'utf8')).map(
        ({ helpUri }) => helpUri,
      ),
    ).toEqual([UNUSED_FIELD_HELP_URI]);
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
              "name": "UnusedPrivateField",
              "shortDescription": {
                "text": "Detects when a private field is declared and/or assigned a value, but not used."
              },
              "helpUri": ${JSON.stringify(UNUSED_FIELD_HELP_URI)}
            }
          ]
        }
      },
      "columnKind": "utf16CodeUnits",
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
          "baselineState": "new",
          "message": {
            "text": ${JSON.stringify(addedField)}
          },
          "locations": [
            {
              "physicalLocation": {
                "artifactLocation": {
                  "uri": "src/main/java/demo/A.java",
                  "uriBaseId": "%SRCROOT%"
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
    const config = `${JSON.stringify({
      preset: 'java',
      exceptions: [
        {
          rule: 'pmd/UnusedPrivateField',
          paths: ['src/main/java/demo/A.java'],
          reason: 'generated holder',
        },
      ],
    })}\n`;
    writeFiles(root, {
      'nitpicker.config.json': config,
      'violations.txt': 'Avoid unused field: legacy\nAvoid unused field: added\n',
    });
    commit(root, 'add a violation with an exception');

    const digest = acceptedDigest(
      ['exception added: pmd/UnusedPrivateField for src/main/java/demo/A.java (generated holder)'],
      {
        'nitpicker.config.json': config,
        'src/main/java/demo/A.java': 'package demo;\n\npublic final class A {}\n',
      },
    );
    const result = run(root, [`--accept-policy-change=${digest}`], { interactive: true });

    expect(result.exitCode, result.text).toBe(0);
    expect(result.json('new-findings.json')).toEqual([]);
  });
  it('reports a missing build tool binary as a tool error', () => {
    const binary = path.join(temporaryRoot('nitpicker-java-none-'), 'no-build-tool');
    build.missingBinary.stub(binary);
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
        'Descriptive findings: 3',
        'Tool errors: 0',
        '',
        'Per-tool counts:',
        'java: total=4 enforceable=1 descriptive=3',
        'repository-hygiene: total=0 enforceable=0 descriptive=0',
        '',
        'Enforceable findings:',
        `pmd/UnusedPrivateField src/main/java/demo/A.java:3 ${unusedFieldMessage('legacy')}`,
        '',
        'Descriptive findings:',
        'coupling/coupling . dependencies summary',
        'coupling/coupling . modules summary',
        'coupling/coupling . packages summary',
        '',
        `Rule reference: ${docsUrl('docs/rules/README.md')} (nitpicker explain <tool/rule> prints one rule)`,
        '',
      ].join('\n'),
    );
  });
});

describe.each([
  ['java', 'a Gradle build', useGradleFixtures, 'repository'],
  ['java', 'a Maven build', useMavenFixtures, 'repository'],
  ['kotlin', 'a Gradle build', useGradleFixtures, 'kotlinRepository'],
])(
  'the exception a %s finding message suggests on %s',
  (preset, _build, useFixtures, repositoryName) => {
    const fixtures = useFixtures(nitpickerCli);
    const repository = (files = {}) => fixtures[repositoryName]({ ...TEST_SOURCE, ...files });
    function liftableFindings(root) {
      writeFiles(root, TEST_REPORTS);
      commit(root, 'add test-only use and console output');
      const result = fixtures.run(root);
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
  },
);
