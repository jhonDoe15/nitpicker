import type { Finding } from '../../../adapters/static-checks/shared.mts';
import type { StructureLayout, StructurePolicy, SizedFile } from './structure-types.mts';
import {
  readHeadPolicy as untypedReadHeadPolicy,
  readLayout as untypedReadLayout,
} from '../../head-policy.mjs';
import { isJavascriptPolicy as untypedIsJavascriptPolicy } from '../../../../javascript/preset/javascript-preset.mjs';
import {
  projectFilePaths as untypedProjectFilePaths,
  projectFilesUnder as untypedProjectFilesUnder,
} from '../../../../../shared/project-files/project-files.mjs';
import { rootPattern as untypedRootPattern } from '../../layout/source-root/root-paths.mjs';
import { collectFileLimitFindings as untypedCollectFileLimitFindings } from '../../../../../shared/rules/file-limits.mjs';
import { folderDepthFindings as untypedFolderDepthFindings } from '../../../../../shared/rules/size/folder-depth.mjs';
import { FOLDER_DEPTH_DEFAULTS as untypedFolderDepthDefaults } from '../../../../../shared/project-rules/size-rules.mjs';
import {
  exceptionMatcher as untypedExceptionMatcher,
  exceptionText as untypedExceptionText,
} from '../../../../../shared/rules/exceptions.mjs';
import {
  MESSAGES as untypedMessages,
  RULE_IDS as untypedRuleIds,
  messageFields as untypedMessageFields,
} from '../../../../../shared/policy.mjs';
import { projectTsconfigs as untypedProjectTsconfigs } from '../../modules/tsconfig-files.mjs';
import { reuseFindings as untypedReuseFindings } from '../reuse/reuse-findings.mjs';
import { firstFileIn as untypedFirstFileIn } from '../../../../../shared/filesystem.mjs';
import { exceptionRoute as untypedExceptionRoute } from '../../../../../shared/exceptions/rule-names.mjs';
import { codeExtensionNames as untypedCodeExtensionNames } from '../../layout.mjs';

type Wording = {
  readonly subject: string;
  readonly below: string;
  readonly advice: (limit: number) => string;
};

export const readHeadPolicy: (environment?: NodeJS.ProcessEnv) => StructurePolicy =
  untypedReadHeadPolicy;

export const readLayout: (environment?: NodeJS.ProcessEnv) => StructureLayout = untypedReadLayout;

export const isJavascriptPolicy: (policy: StructurePolicy) => boolean = untypedIsJavascriptPolicy;

export const projectFilesUnder: (
  root: string,
  options: {
    readonly skipDirectory: (absolute: string, entry: { readonly name: string }) => boolean;
  },
) => string[] = untypedProjectFilesUnder;

const rootPattern: (roots: readonly string[]) => string = untypedRootPattern;

export function rootExpression(roots: readonly string[]): RegExp {
  return new RegExp(rootPattern(roots));
}

export const collectFileLimitFindings: (
  projectRoot: string,
  entries: readonly SizedFile[],
  options: {
    readonly analyzerName: string;
    readonly thresholds: unknown;
    readonly exceptions: unknown[];
  },
) => Finding[] = untypedCollectFileLimitFindings;

export const folderDepthFindings: (
  files: readonly SizedFile[],
  options: {
    readonly analyzerName: string;
    readonly limit: number;
    readonly exceptions: unknown[];
    readonly wording: Wording;
    readonly depthOf: (file: SizedFile) => number | undefined;
  },
) => Finding[] = untypedFolderDepthFindings;

export const FOLDER_DEPTH_DEFAULTS: { readonly typescript: number } = untypedFolderDepthDefaults;

export const exceptionMatcher: (
  exceptions: unknown[],
) => (rule: string, ...candidates: readonly string[]) => boolean = untypedExceptionMatcher;

export const exceptionText: (rule: string, path: string) => string = untypedExceptionText;

export const RULE_IDS: {
  readonly javascriptInTypescriptProject: string;
  readonly componentStoryMissing: string;
} = untypedRuleIds;

export const MESSAGES: {
  readonly javascriptInTypescriptProject: unknown;
  readonly componentStoryMissing: unknown;
  readonly componentStoryMissingUnenforced: unknown;
} = untypedMessages;

export const messageFields: (
  template: unknown,
  values: Readonly<Record<string, string>>,
) => { readonly message: string } = untypedMessageFields;

type ProjectTsconfigs = (
  projectRoot: string,
  files: readonly string[],
  isHidden: (file: string) => boolean,
) => string[];

function isProjectTsconfigs(value: unknown): value is ProjectTsconfigs {
  return typeof value === 'function';
}

function loadedProjectTsconfigs(candidate: unknown): ProjectTsconfigs {
  if (!isProjectTsconfigs(candidate)) {
    throw new TypeError('projectTsconfigs does not load as a function');
  }
  return candidate;
}

export const projectTsconfigs: ProjectTsconfigs = loadedProjectTsconfigs(untypedProjectTsconfigs);

export const codeExtensionNames: string[] = untypedCodeExtensionNames;

type ReuseFindings = (
  options: {
    readonly projectRoot: string;
    readonly analyzerName: string;
    readonly baselineRoot?: string | undefined;
    readonly baselinePaths?: unknown;
  },
  environment: NodeJS.ProcessEnv,
) => Finding[];

function isReuseFindings(value: unknown): value is ReuseFindings {
  return typeof value === 'function';
}

function loadedReuseFindings(candidate: unknown): ReuseFindings {
  if (!isReuseFindings(candidate)) {
    throw new TypeError('reuseFindings does not load as a function');
  }
  return candidate;
}

export const reuseFindings: ReuseFindings = loadedReuseFindings(untypedReuseFindings);

export const firstFileIn: (root: string, names: readonly string[]) => string | undefined =
  untypedFirstFileIn;

export const projectFilePaths: (
  root: string,
  options: { readonly skipDirectory: (absolute: string) => boolean },
) => string[] = untypedProjectFilePaths;

export const exceptionRoute: (route: {
  readonly rule: string;
  readonly path: string;
  readonly function: string | undefined;
  readonly name: string | undefined;
  readonly key: string | undefined;
}) => string | undefined = untypedExceptionRoute;
