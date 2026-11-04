import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runCli as nitpickerCli } from '../../cli.mjs';
import { commit } from '../../diff/git/test-support/git-repository.mjs';
import { writeFiles } from '../../diff/git/test-support/fixture-files.mjs';
import { useGradleFixtures, useMavenFixtures } from '../java/test-support/java-cli-harness.mjs';

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
const NOTES_FILE = 'src/main/java/demo/Notes.java';
const notesSource = (docLines) =>
  [
    'package demo;',
    '',
    'public final class Notes {',
    '  /**',
    ...docLines.map((line) => `   * ${line}`),
    '   */',
    '  public int settings() {',
    '    return 1;',
    '  }',
    '}',
    '',
  ].join('\n');
const NOTES_SOURCE = {
  [NOTES_FILE]: notesSource(['Reads the cache settings that the build writes.']),
};
const LONG_DOC_SOURCE = {
  [NOTES_FILE]: notesSource([
    'Reads the cache settings that the build writes.',
    'The settings come from the build directory.',
    'Missing settings fall back to the defaults.',
    'Unknown keys are ignored without a warning.',
    'The result is cached for the whole run.',
    'A second call returns the cached result.',
  ]),
};
const LIFTABLE_RULES = ['test-only-export', 'test-console-output', 'doc-comment-content'];

describe.each([
  ['java', 'a Gradle build', useGradleFixtures, 'repository'],
  ['java', 'a Maven build', useMavenFixtures, 'repository'],
  ['kotlin', 'a Gradle build', useGradleFixtures, 'kotlinRepository'],
])(
  'the exception a %s finding message suggests on %s',
  (preset, _build, useFixtures, repositoryName) => {
    const fixtures = useFixtures(nitpickerCli);
    const repository = (files = {}) =>
      fixtures[repositoryName]({ ...TEST_SOURCE, ...NOTES_SOURCE, ...files });
    function liftableFindings(root) {
      writeFiles(root, { ...TEST_REPORTS, ...LONG_DOC_SOURCE });
      commit(root, 'add test-only use, console output and a long doc comment');
      const result = fixtures.run(root);
      return {
        result,
        found: result.json('new-findings.json').filter(({ rule }) => LIFTABLE_RULES.includes(rule)),
      };
    }
    function liftedWith(entryOf) {
      const { found } = liftableFindings(repository());
      const exceptions = found.map((finding) => ({
        ...entryOf(finding),
        reason: 'Loaded by name from a plugin descriptor of another build.',
      }));
      const config = JSON.parse(readFileSync(path.join(repository(), 'nitpicker.config.json')));
      const { result, found: lifted } = liftableFindings(
        repository({
          'nitpicker.config.json': `${JSON.stringify({ ...config, exceptions })}\n`,
        }),
      );
      return { found, config, result, lifted };
    }
    it('is accepted by the preset and lifts the finding', () => {
      const { found, config, result, lifted } = liftedWith(({ message }) =>
        JSON.parse(EXCEPTION_ENTRY.exec(message)[0]),
      );

      expect(found.map(({ rule }) => rule).toSorted()).toEqual(LIFTABLE_RULES.toSorted());
      expect({ exitCode: result.exitCode, lifted }, result.text).toEqual({
        exitCode: 0,
        lifted: [],
      });
      expect(preset).toBe(config.preset);
    });
    it('lifts the finding when the entry names it as it prints, <tool>/<rule>', () => {
      const { result, lifted } = liftedWith(({ tool, rule, message }) => ({
        ...JSON.parse(EXCEPTION_ENTRY.exec(message)[0]),
        rule: `${tool}/${rule}`,
      }));

      expect({ exitCode: result.exitCode, lifted }, result.text).toEqual({
        exitCode: 0,
        lifted: [],
      });
    });
  },
);
