import type { ProgramLayout } from './workspace/workspace-types.mts';
import { exceptionMatcher as untypedExceptionMatcher } from '../../../../shared/rules/exceptions.mts';
import { readLayout as untypedReadLayout } from '../head-policy.mts';

export type AnalysisLayout = ProgramLayout & {
  readonly javascript: boolean;
  readonly isSourceFile: (relativePath: string) => boolean;
  projectCodeFiles(projectRoot: string): readonly string[];
};

type IsExcepted = (rule: string, ...candidates: readonly unknown[]) => boolean;

export const exceptionMatcher: (exceptions: readonly unknown[]) => IsExcepted =
  untypedExceptionMatcher;
export { isReactProject } from '../eslint-config/scope-support.mts';
export { readHeadPolicy } from '../head-policy.mts';
export const readLayout: (environment: NodeJS.ProcessEnv) => AnalysisLayout = untypedReadLayout;
export { createContext, isAnalyzedFile } from './context.mts';
export { unusedApiFindings } from './findings.mts';
export { collectReferences } from './references/references.mts';
export { declaresCheckable } from './syntax/candidates.mts';
export { collectTargets, registerWrapperAliases } from './syntax/declarations.mts';
export { loadPackages } from './workspace/packages.mts';
