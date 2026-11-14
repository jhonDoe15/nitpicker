import {
  fixtureGit as untypedFixtureGit,
  useGitFixtures as untypedUseGitFixtures,
} from '../../../../core/diff/git/test-support/git-repository.mjs';
import { writeFiles as untypedWriteFiles } from '../../../../core/diff/git/test-support/fixture-files.mjs';
import {
  fixReport as untypedFixReport,
  useFixProject as untypedUseFixProject,
} from '../../../../core/fix/test-support/fix-project.mjs';
import { linkSentence as untypedLinkSentence } from '../../../../shared/messages/test-support/link-sentence.mjs';
import { fieldOf, listOf, textOf } from '../../../../shared/values/readers.mts';
import type { FixOptions } from '../../../../core/fix/run-fix.mts';

type Files = Readonly<Record<string, string>>;
type RepositoryOptions = { baseRef?: string; prefix?: string };
export type GitRepository = { root: string; baseRef: string | undefined };
type FixProjectInput = {
  committed: Files;
  changed: Files;
  prepare?: (root: string) => void;
  realAnalyzers?: true;
};
type ReportedFinding = { tool: string; rule: string; path: string };
export type FixProjectResult = {
  exitCode: unknown;
  stdout: string;
  stderr: string;
  read: (name: string) => string;
  baseSource: (name: string) => string;
  newFindings: () => ReportedFinding[];
};
type RequiredOptions = Pick<
  FixOptions,
  'repositoryRoot' | 'projectRoot' | 'executeFixCommand' | 'headPolicy' | 'config'
>;

const fixtureGit: (root: string, arguments_: readonly string[]) => string = untypedFixtureGit;
const writeFiles: (root: string, files: Files) => void = untypedWriteFiles;

function methodOf(value: unknown, name: string): (...args: unknown[]) => unknown {
  const method = fieldOf(value, name);
  if (typeof method !== 'function') {
    throw new TypeError(`${name} is not a function`);
  }
  return (...args: unknown[]) => {
    const result: unknown = Reflect.apply(method, value, args);
    return result;
  };
}

function useGitFixtures(): {
  createGitRepository: (files: Files, options?: RepositoryOptions) => GitRepository;
  temporaryRoot: (prefix: string) => string;
} {
  const fixtures: unknown = Reflect.apply(untypedUseGitFixtures, undefined, []);
  const create = methodOf(fixtures, 'createGitRepository');
  const temporary = methodOf(fixtures, 'temporaryRoot');
  return {
    createGitRepository: (files, options = {}) => {
      const repository = create(files, options);
      return { root: textOf(fieldOf(repository, 'root')), baseRef: options.baseRef };
    },
    temporaryRoot: (prefix) => textOf(temporary(prefix)),
  };
}

function useFixProject(): { fix: (input: FixProjectInput) => FixProjectResult } {
  const project: unknown = Reflect.apply(untypedUseFixProject, undefined, []);
  const fix = methodOf(project, 'fix');
  return {
    fix: (input) => {
      const result = fix(input);
      const read = methodOf(result, 'read');
      const baseSource = methodOf(result, 'baseSource');
      const newFindings = methodOf(result, 'newFindings');
      return {
        exitCode: fieldOf(result, 'exitCode'),
        stdout: textOf(fieldOf(result, 'stdout')),
        stderr: textOf(fieldOf(result, 'stderr')),
        read: (name) => textOf(read(name)),
        baseSource: (name) => textOf(baseSource(name)),
        newFindings: () =>
          listOf(newFindings()).map((found) => ({
            tool: textOf(fieldOf(found, 'tool')),
            rule: textOf(fieldOf(found, 'rule')),
            path: textOf(fieldOf(found, 'path')),
          })),
      };
    },
  };
}

function fixReport(stdout: string): string {
  return textOf(untypedFixReport(stdout));
}

function linkSentence(key: string): string {
  return textOf(untypedLinkSentence(key));
}

function fixOptions(input: RequiredOptions & Partial<FixOptions>): FixOptions {
  return {
    baseRef: 'base',
    scope: undefined,
    environment: {},
    spawnEnvironment: undefined,
    dryRun: false,
    selectedRules: undefined,
    allFiles: false,
    recipes: undefined,
    analyzeFixes: undefined,
    verifyMode: 'narrow',
    ...input,
  };
}

export {
  fixOptions,
  fixReport,
  fixtureGit,
  linkSentence,
  useFixProject,
  useGitFixtures,
  writeFiles,
};
