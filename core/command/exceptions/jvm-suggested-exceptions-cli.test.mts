import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runCli as nitpickerCli } from '../../cli.mts';
import { commit } from '../../diff/git/test-support/git-repository.mts';
import { writeFiles } from '../../diff/git/test-support/fixture-files.mts';
import { useGradleFixtures, useMavenFixtures } from '../java/test-support/java-cli-harness.mts';
import type { GradleFixtures, MavenFixtures } from '../java/test-support/java-cli-harness.mts';
import type { PresetRun, RunNitpickerCli } from '../test-support/fixture-types.mts';
import { fieldOf, fieldsOf, listOf, parseJson, textOf } from '../../../shared/values/readers.mts';

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
const notesSource = (docLines: readonly string[]) =>
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

type JvmFixtures = GradleFixtures | MavenFixtures;
type JvmCase = [string, string, (cli: RunNitpickerCli) => JvmFixtures, string];

function suggestedEntry(finding: unknown): Readonly<Record<string, unknown>> {
  const text = EXCEPTION_ENTRY.exec(textOf(fieldOf(finding, 'message')))?.[0] ?? '';
  return fieldsOf(parseJson(text));
}

const CASES: JvmCase[] = [
  ['java', 'a Gradle build', useGradleFixtures, 'repository'],
  ['java', 'a Maven build', useMavenFixtures, 'repository'],
  ['kotlin', 'a Gradle build', useGradleFixtures, 'kotlinRepository'],
];

describe.each(CASES)(
  'the exception a %s finding message suggests on %s',
  (preset, _build, useFixtures, repositoryName) => {
    const fixtures = useFixtures(nitpickerCli);
    const makeRepository =
      repositoryName === 'kotlinRepository' && 'kotlinRepository' in fixtures
        ? fixtures.kotlinRepository
        : fixtures.repository;
    const repository = (files: Readonly<Record<string, string>> = {}) =>
      makeRepository({ ...TEST_SOURCE, ...NOTES_SOURCE, ...files });
    function liftableFindings(root: string): { result: PresetRun; found: readonly unknown[] } {
      writeFiles(root, { ...TEST_REPORTS, ...LONG_DOC_SOURCE });
      commit(root, 'add test-only use, console output and a long doc comment');
      const result = fixtures.run(root);
      return {
        result,
        found: listOf(result.json('new-findings.json')).filter((finding) =>
          LIFTABLE_RULES.includes(textOf(fieldOf(finding, 'rule'))),
        ),
      };
    }
    function liftedWith(entryOf: (finding: unknown) => object) {
      const { found } = liftableFindings(repository());
      const exceptions = found.map((finding) => ({
        ...entryOf(finding),
        reason: 'Loaded by name from a plugin descriptor of another build.',
      }));
      const config = parseJson(
        readFileSync(path.join(repository(), 'nitpicker.config.json'), 'utf8'),
      );
      const { result, found: lifted } = liftableFindings(
        repository({
          'nitpicker.config.json': `${JSON.stringify({ ...fieldsOf(config), exceptions })}\n`,
        }),
      );
      return { found, config, result, lifted };
    }
    it('is accepted by the preset and lifts the finding', () => {
      const { found, config, result, lifted } = liftedWith(suggestedEntry);

      expect(found.map((finding) => textOf(fieldOf(finding, 'rule'))).toSorted()).toEqual(
        LIFTABLE_RULES.toSorted(),
      );
      expect({ exitCode: result.exitCode, lifted }, result.text).toEqual({
        exitCode: 0,
        lifted: [],
      });
      expect(preset).toBe(fieldOf(config, 'preset'));
    });
    it('lifts the finding when the entry names it as it prints, <tool>/<rule>', () => {
      const { result, lifted } = liftedWith((finding) => ({
        ...suggestedEntry(finding),
        rule: `${textOf(fieldOf(finding, 'tool'))}/${textOf(fieldOf(finding, 'rule'))}`,
      }));

      expect({ exitCode: result.exitCode, lifted }, result.text).toEqual({
        exitCode: 0,
        lifted: [],
      });
    });
  },
);
