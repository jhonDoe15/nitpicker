import { createGitTemplate as untypedCreateGitTemplate } from '../../../../../core/diff/git/test-support/git-repository.mjs';
import { findingsSchemaErrors as untypedFindingsSchemaErrors } from '../../../../../core/diff/comparison/test-support/findings-schema-check.mjs';
import {
  createCleanProject as untypedCreateCleanProject,
  git as untypedGit,
  readReport as untypedReadReport,
  runNitpicker as untypedRunNitpicker,
} from '../../../../typescript/preset/clean-projects/test-support/clean-project.mjs';

export const createGitTemplate: () => string = untypedCreateGitTemplate;

export const findingsSchemaErrors: (findings: readonly unknown[]) => string[] =
  untypedFindingsSchemaErrors;

export const createCleanProject: (project: {
  readonly fixtureRoot: string;
  readonly gitTemplateRoot: string;
  readonly name: string;
  readonly files?: Readonly<Record<string, string>>;
}) => string = untypedCreateCleanProject;

export const git: (root: string, ...args: string[]) => unknown = untypedGit;

export const readReport: (root: string, ...segments: string[]) => unknown = untypedReadReport;

export const runNitpicker: (
  root: string,
  argumentsList: string[],
) => { exitCode: number; stdoutText: string; stderrText: string } = untypedRunNitpicker;
