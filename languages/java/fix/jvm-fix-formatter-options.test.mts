import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fixtureGit, useGitFixtures } from '../../../core/diff/git/test-support/git-repository.mts';
import { writeFiles } from '../../../core/diff/git/test-support/fixture-files.mts';
import { fixWorkingTree } from '../../../core/fix/run-fix.mts';
import { fakeJvmTools } from './test-support/fake-jvm-tools.mts';
import { javaFixOptions } from './test-support/fix-options.mts';

const { createGitRepository, temporaryRoot } = useGitFixtures();
const JAVA = 'src/main/java/demo';
const TOOLS_PROPERTY = '-Pnitpicker.fix.tools=';
const TEMPORARY = new RegExp(`${tmpdir()}/nitpicker-fix-\\w+`, 'gu');

afterEach(() => {
  vi.unstubAllEnvs();
});

function fixWith(conventions: object): { args: string[]; tools: string | undefined } {
  vi.stubEnv('XDG_CACHE_HOME', temporaryRoot('nitpicker-fix-cache-'));
  const repository = createGitRepository(
    { 'build.gradle': "plugins { id 'java' }\n" },
    { baseRef: 'base' },
  );
  fixtureGit(repository.root, ['checkout', '-q', '-b', 'topic']);
  writeFiles(repository.root, { [`${JAVA}/New.java`]: 'class  New {}\n' });
  const tools = fakeJvmTools();
  fixWorkingTree(
    javaFixOptions({
      root: repository.root,
      executeFixCommand: tools.executeFixCommand,
      headPolicy: { exclude: [], conventions },
      config: { preset: 'java' },
    }),
  );
  const [launch] = tools.launches;
  const [call] = tools.calls;
  const cwd = launch?.cwd ?? '';
  return {
    args: (launch?.args ?? []).map((argument) =>
      argument.replaceAll(cwd, '<cwd>').replace(TEMPORARY, '<tmp>'),
    ),
    tools: call?.args.find((argument) => argument.startsWith(TOOLS_PROPERTY)),
  };
}

describe('--fix for Java with the formatter version and options the build file pins', () => {
  it('formats with that release and passes the skip flags', () => {
    const { args, tools } = fixWith({
      'java.indentation': '4',
      'java.formatterVersion': '1.17.0',
      'java.formatterOptions': ['skipReflowingLongStrings'],
    });

    expect(args).toEqual([
      '--aosp',
      '--skip-reflowing-long-strings',
      '--replace',
      '<cwd>/0/New.java',
    ]);
    expect(tools).toBe(
      `${TOOLS_PROPERTY}java-format=com.google.googlejavaformat:google-java-format:1.17.0`,
    );
  });

  it('gives palantir-java-format only the flag its command line has', () => {
    const { args, tools } = fixWith({
      'java.formatter': 'palantir',
      'java.formatterVersion': '2.50.0',
      'java.formatterOptions': ['skipJavadocFormatting', 'skipReflowingLongStrings'],
    });

    expect(args).toEqual([
      '--palantir',
      '--skip-reflowing-long-strings',
      '--replace',
      '<cwd>/0/New.java',
    ]);
    expect(tools).toBe(
      `${TOOLS_PROPERTY}java-format=com.palantir.javaformat:palantir-java-format:2.50.0`,
    );
  });
});
