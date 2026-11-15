import {
  PRETTIER_PROJECT_FILES,
  projectTsconfigFiles,
  STRYKER_PROJECT_FILES,
  TESTS_TOOL,
  testRunnerProjectFiles,
} from '../../types/tool-views.mts';
import { resolveLayoutFor } from '../../types/typed-views.mts';
import type { ToolFileCandidates as Candidates } from '../../types/policy-types.mts';

export const PRETTIER = 'prettier';
export const TYPESCRIPT = 'typescript';
export const DETEKT = 'detekt';
export const ESLINT = 'eslint';
export const JSCPD = 'jscpd';
export const KOTLIN_TOOLS = [DETEKT, 'ktlint', 'ktfmt'];
export const GO_TOOLS = ['gofumpt', 'goimports', 'staticcheck'];
export const STATICCHECK_CONFIG = 'staticcheck.conf';
export const SCRIPT_PRESETS: ReadonlySet<string | undefined> = new Set([
  undefined,
  TYPESCRIPT,
  'javascript',
]);
export const SCRIPT_TOOL_FILES: ReadonlyMap<string, Candidates> = new Map<string, Candidates>([
  [PRETTIER, () => PRETTIER_PROJECT_FILES],
  ['stryker', () => STRYKER_PROJECT_FILES],
  [TYPESCRIPT, ({ config, root }) => projectTsconfigFiles(root, resolveLayoutFor(config))],
  [TESTS_TOOL, ({ config, root }) => testRunnerProjectFiles(root, config)],
]);
