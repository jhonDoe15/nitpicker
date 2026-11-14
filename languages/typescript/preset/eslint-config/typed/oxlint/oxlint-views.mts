import type { LintResult } from '../../../../adapters/oxlint/plan/oxlint-shapes.mts';
import {
  createProject as untypedCreateProject,
  lintProject as untypedLintProject,
} from '../../../../adapters/oxlint/test-support/oxlint-project.mjs';

export const createProject: (prefix: string, files: Readonly<Record<string, string>>) => string =
  untypedCreateProject;

export const lintProject: (options: {
  readonly root: string;
  readonly patterns: string[];
  readonly projectConfigName: string | undefined;
  readonly runEslintCli?: () => unknown[];
}) => Promise<LintResult[]> = untypedLintProject;
