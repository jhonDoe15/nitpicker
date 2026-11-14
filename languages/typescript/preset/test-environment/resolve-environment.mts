import path from 'node:path';
import { readHeadPolicy, readLayout } from '../../adapters/typed/head-policy.mts';
import { fieldOf, textOf, textsOf } from '../../../../shared/values/readers.mts';
import type { EnvironmentOptions, Environments } from './typed/environment-types.mts';
import { projectConfigFile } from './config-files.mjs';
import { DEFAULT_ENVIRONMENT } from './environments.mjs';
import { readConfigInChild as untypedReadConfigInChild } from './read-environment.mjs';

type EnvironmentNotice = {
  readonly tool: string;
  readonly rule: string;
  readonly path: string;
  readonly identity: string;
  readonly message: string;
  readonly classification: string;
};

export const TEST_ENVIRONMENTS_VARIABLE = 'NITPICKER_TEST_ENVIRONMENTS';
export const TEST_ENVIRONMENT_RULE = 'nitpicker/no-unused-dom-environment';
export const LINT_CONFIG = 'languages/typescript/preset/defaults/eslint.config.mjs';

const readConfigInChild: (options: {
  configFile: string;
  projectRoot: string;
  resolveRoots: string[];
  timeoutMs: number | undefined;
}) => Environments = untypedReadConfigInChild;

const UNKNOWN: Environments = { environment: undefined, scopes: [] };
const WHOLE_PROJECT_GLOBS = new Set(['**', '**/*']);

export function loadTestEnvironments({
  projectRoot,
  liveProjectRoot = projectRoot,
  timeoutMs,
}: EnvironmentOptions): Environments {
  const configFile = projectConfigFile(projectRoot);
  if (configFile === undefined) {
    return { ...UNKNOWN, environment: DEFAULT_ENVIRONMENT };
  }
  try {
    return readConfigInChild({
      configFile,
      projectRoot,
      resolveRoots: [...new Set([projectRoot, liveProjectRoot])],
      timeoutMs,
    });
  } catch (error) {
    const configPath = path.relative(projectRoot, configFile).split(path.sep).join('/');
    return { ...UNKNOWN, notice: { path: configPath, message: noticeFor(error) } };
  }
}

function noticeFor(error: unknown): string {
  const reason = error instanceof Error ? error.message : String(error);
  return `The DOM-environment check only uses per-file directives: ${reason.replace(/\.$/u, '')}.`;
}

function ruleIsExcepted(exceptions: readonly unknown[]): boolean {
  return exceptions.some(
    (exception) =>
      textOf(fieldOf(exception, 'rule')) === TEST_ENVIRONMENT_RULE &&
      textsOf(fieldOf(exception, 'paths')).some((glob) => WHOLE_PROJECT_GLOBS.has(glob)),
  );
}

export function testEnvironmentsFor(
  options: EnvironmentOptions & { readonly configRelativePath: string },
): Environments {
  const layout = readLayout();
  const selected =
    options.configRelativePath === LINT_CONFIG &&
    !ruleIsExcepted(readHeadPolicy().exceptions) &&
    layout.projectCodeFiles(options.projectRoot).some((file) => layout.isRunnableTestFile(file));
  return selected ? loadTestEnvironments(options) : UNKNOWN;
}

export function testEnvironmentNotices({
  testEnvironments,
  analyzerName,
}: {
  readonly testEnvironments: { readonly notice?: Environments['notice'] };
  readonly analyzerName: string;
}): EnvironmentNotice[] {
  const notice = testEnvironments.notice;
  if (notice === undefined) {
    return [];
  }
  return [
    {
      tool: analyzerName,
      rule: TEST_ENVIRONMENT_RULE,
      path: notice.path,
      identity: 'test-config-unreadable',
      message: notice.message,
      classification: 'descriptive',
    },
  ];
}
