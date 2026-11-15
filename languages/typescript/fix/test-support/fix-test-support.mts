import {
  fixtureGit as untypedFixtureGit,
  useGitFixtures as untypedUseGitFixtures,
} from '../../../../core/diff/git/test-support/git-repository.mjs';
import { writeFiles as untypedWriteFiles } from '../../../../core/diff/git/test-support/fixture-files.mjs';
import { directWriter as untypedDirectWriter } from '../../../../core/fix/engine/writer.mjs';
import { resolveHeadPolicy as untypedResolveHeadPolicy } from '../../preset/head-policy.mjs';
import { resolveLayoutFor as untypedResolveLayoutFor } from '../../preset/layout.mjs';
import { linkSentence as untypedLinkSentence } from '../../../../shared/messages/test-support/link-sentence.mjs';
import type { FixOptions } from '../../../../core/fix/run-fix.mts';
import type { FixInvocation, FixWriter } from '../../../../core/fix/typed/fix-types.mts';
import type { Layout } from '../typed/fix-views.mts';
import { fieldOf, textOf } from '../../../../shared/values/readers.mts';

type HeadPolicy = { readonly tools?: { readonly knip?: unknown } };

type Files = Readonly<Record<string, string>>;

type GitRepository = { readonly root: string; readonly baseSha: string; readonly baseRef: string };

export const fixtureGit: (
  repositoryRoot: string,
  arguments_: readonly string[],
  options?: { readonly input?: string },
) => string = untypedFixtureGit;

export const writeFiles: (root: string, files: Files) => void = untypedWriteFiles;

export const useGitFixtures: () => {
  readonly temporaryRoot: (prefix: string) => string;
  readonly createGitRepository: (
    files: Files,
    options: { readonly prefix?: string; readonly baseRef: string },
  ) => GitRepository;
} = untypedUseGitFixtures;

export const directWriter: (projectRoot: string) => FixWriter = untypedDirectWriter;

export const resolveHeadPolicy: (config?: object) => HeadPolicy = untypedResolveHeadPolicy;

export const resolveLayoutFor: (policy: HeadPolicy) => Layout = untypedResolveLayoutFor;

export function linkSentence(key: string): string {
  const sentence = untypedLinkSentence(key);
  if (sentence === undefined) {
    throw new Error(`No troubleshooting sentence for ${key}`);
  }
  return sentence;
}

export function operationOf(invocation: FixInvocation): string {
  return textOf(fieldOf(invocation, 'operation'));
}

export function fixOptions(
  repositoryRoot: string,
  overrides: Partial<FixOptions> = {},
): FixOptions {
  return {
    repositoryRoot,
    projectRoot: repositoryRoot,
    baseRef: 'base',
    executeFixCommand: undefined,
    headPolicy: undefined,
    config: undefined,
    scope: undefined,
    environment: {},
    spawnEnvironment: undefined,
    dryRun: false,
    selectedRules: undefined,
    allFiles: false,
    recipes: undefined,
    analyzeFixes: undefined,
    verifyMode: 'narrow',
    ...overrides,
  };
}

export function topicRepository(
  createGitRepository: ReturnType<typeof useGitFixtures>['createGitRepository'],
  committed: Files,
  changed: Files,
): GitRepository {
  const repository = createGitRepository(committed, { baseRef: 'base' });
  fixtureGit(repository.root, ['checkout', '-q', '-b', 'topic']);
  writeFiles(repository.root, changed);
  return repository;
}
