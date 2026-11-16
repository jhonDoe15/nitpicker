import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { vi } from 'vitest';
import {
  fixtureGit,
  useGitFixtures,
} from '../../../../core/diff/git/test-support/git-repository.mts';
import { writeFiles } from '../../../../core/diff/git/test-support/fixture-files.mts';
import { fixWorkingTree } from '../../../../core/fix/run-fix.mts';
import type { FixOutcome } from '../../../../core/fix/typed/fix-types.mts';
import { containedPath } from '../../../../core/fix/common/contained-path.mjs';
import { linkSentence as untypedLinkSentence } from '../../../../shared/messages/test-support/link-sentence.mjs';
import { textOf } from '../../../../shared/values/readers.mts';
import { callUntyped } from '../../adapters/typed/java-values.mts';
import type { FakeJvmTools, RecordedLaunch } from './fake-jvm-tools.mts';
import { javaFixOptions } from './fix-options.mts';

const { createGitRepository, temporaryRoot } = useGitFixtures();
const TEMPORARY = new RegExp(`${tmpdir()}/nitpicker-fix-\\w+`, 'gu');

export const GRADLE = { 'build.gradle': "plugins { id 'java' }\n" };
export const JAVA = 'src/main/java/demo';
export const KT = 'src/main/kotlin/demo';
export const GOOGLE_COORDINATES =
  'java-format=com.google.googlejavaformat:google-java-format:1.35.0';
export const TOOLS_PROPERTY = '-Pnitpicker.fix.tools=';

type Files = Readonly<Record<string, string>>;
type Repository = { readonly root: string };
type FixPolicy = { readonly headPolicy?: object; readonly config?: object };

export function linkSentence(key: string): string {
  return textOf(callUntyped(untypedLinkSentence, key));
}

export function topic(base: Files, changes: Files): Repository {
  vi.stubEnv('XDG_CACHE_HOME', temporaryRoot('nitpicker-fix-cache-'));
  const repository = createGitRepository(base, { baseRef: 'base' });
  fixtureGit(repository.root, ['checkout', '-q', '-b', 'topic']);
  writeFiles(repository.root, changes);
  return repository;
}

export function fix(
  repository: Repository,
  tools: FakeJvmTools,
  { headPolicy = {}, config = { preset: 'java' } }: FixPolicy = {},
): FixOutcome {
  return fixWorkingTree(
    javaFixOptions({
      root: repository.root,
      executeFixCommand: tools.executeFixCommand,
      headPolicy: { exclude: [], conventions: {}, ...headPolicy },
      config,
    }),
  );
}

export function read(repository: Repository, name: string): string {
  return readFileSync(textOf(containedPath(repository.root, name)), 'utf8');
}

export function launchOf({ launches }: FakeJvmTools, index = 0): Omit<RecordedLaunch, 'cwd'> {
  const found = launches[index];
  if (found === undefined) {
    throw new Error(`no launch ${String(index)}`);
  }
  const { cwd, ...launch } = found;
  return {
    ...launch,
    args: launch.args.map((argument) =>
      argument.replaceAll(cwd, '<cwd>').replace(TEMPORARY, '<tmp>'),
    ),
  };
}

export function toolsProperty(tools: FakeJvmTools): string | undefined {
  return tools.calls[0]?.args.find((argument) => argument.startsWith(TOOLS_PROPERTY));
}
