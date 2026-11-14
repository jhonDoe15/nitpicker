import type TypeScript from 'typescript';
import type { Finding } from '../../../../../shared/values/findings.mts';
import { exceptionMatcher as untypedExceptionMatcher } from '../../../../../shared/rules/exceptions.mjs';
import { isReactProject as untypedIsReactProject } from '../../eslint-config/scope-support.mjs';
import {
  readHeadPolicy as untypedReadHeadPolicy,
  readLayout as untypedReadLayout,
} from '../../head-policy.mjs';
import {
  createContext as untypedCreateContext,
  isTypeScriptFile as untypedIsTypeScriptFile,
} from '../context.mjs';
import { unusedApiFindings as untypedUnusedApiFindings } from '../findings.mjs';
import { collectReferences as untypedCollectReferences } from '../references/references.mjs';
import { declaresCheckable as untypedDeclaresCheckable } from '../syntax/candidates.mjs';
import {
  collectTargets as untypedCollectTargets,
  registerWrapperAliases as untypedRegisterWrapperAliases,
} from '../syntax/declarations.mjs';
import { loadPackages as untypedLoadPackages } from '../workspace/packages.mjs';
import type { PackagesInfo, ProgramLayout } from '../workspace/workspace-types.mts';

export type AnalysisLayout = ProgramLayout & {
  readonly javascript: boolean;
  readonly isSourceFile: (relativePath: string) => boolean;
  projectCodeFiles(projectRoot: string): readonly string[];
};

export type Context = { readonly owned: unknown };
type IsExcepted = (rule: string, ...candidates: readonly unknown[]) => boolean;

export const exceptionMatcher: (exceptions: unknown[]) => IsExcepted = untypedExceptionMatcher;
export const isReactProject: (options: {
  projectRoot: string;
  react: object;
  javascript: boolean;
}) => boolean = untypedIsReactProject;
export const readHeadPolicy: (environment: NodeJS.ProcessEnv) => {
  readonly exceptions: unknown[];
  readonly react: object;
} = untypedReadHeadPolicy;
export const readLayout: (environment: NodeJS.ProcessEnv) => AnalysisLayout = untypedReadLayout;
export const createContext: (options: {
  program: TypeScript.Program;
  projectRoot: string;
  layout: AnalysisLayout;
  packagesInfo: PackagesInfo;
}) => Context = untypedCreateContext;
export const isTypeScriptFile: (file: string) => boolean = untypedIsTypeScriptFile;
export const unusedApiFindings: (
  registry: unknown,
  context: {
    readonly owned: unknown;
    readonly analyzerName: string;
    readonly isExcepted: IsExcepted;
  },
) => Finding[] = untypedUnusedApiFindings;
export const collectReferences: (context: Context, registry: unknown) => void =
  untypedCollectReferences;
export const declaresCheckable: (sourceFile: TypeScript.SourceFile, react: boolean) => boolean =
  untypedDeclaresCheckable;
export const collectTargets: (context: Context) => unknown = untypedCollectTargets;
export const registerWrapperAliases: (context: Context, registry: unknown) => void =
  untypedRegisterWrapperAliases;
export const loadPackages: (projectRoot: string, layout: AnalysisLayout) => PackagesInfo =
  untypedLoadPackages;
