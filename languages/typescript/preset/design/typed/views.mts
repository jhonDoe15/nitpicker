import type TypeScript from 'typescript';
import type { Finding } from '../../../../../shared/values/findings.mts';
import { sharedFactFindings as untypedSharedFactFindings } from '../../../../../shared/rules/facts/evaluate.mjs';
import { DESIGN_RULES as untypedDesignRules } from '../../../../../shared/project-rules/design/design-rules.mjs';
import {
  readHeadPolicy as untypedReadHeadPolicy,
  readLayout as untypedReadLayout,
} from '../../head-policy.mjs';
import {
  createContext as untypedCreateContext,
  isGenerated as untypedIsGenerated,
} from '../../unused-api/context.mjs';
import { loadPackages as untypedLoadPackages } from '../../unused-api/workspace/packages.mjs';
import type { AnalysisLayout } from '../../unused-api/typed/analysis-views.mts';
import type { ReexportLayout } from '../../unused-api/test-only/reexported-exports.mts';
import type { PackagesInfo } from '../../unused-api/workspace/workspace-types.mts';

export type DesignLayout = AnalysisLayout &
  ReexportLayout & { readonly isGeneratedPath: (file: string) => boolean };

export type FileInfo = {
  readonly insideProject: boolean;
  readonly role: string;
  readonly path: string;
};

export type DesignContext = {
  readonly checker: TypeScript.TypeChecker;
  readonly program: TypeScript.Program;
  readonly files: readonly TypeScript.SourceFile[];
  readonly fileInfo: ReadonlyMap<string, FileInfo>;
};

export type Frameworks = { readonly defaultExports?: readonly string[] };

type HeadPolicyView = { readonly frameworks?: Frameworks };

export const readLayout: (environment: NodeJS.ProcessEnv) => DesignLayout = untypedReadLayout;
export const readHeadPolicy: (environment: NodeJS.ProcessEnv) => HeadPolicyView =
  untypedReadHeadPolicy;
export const loadPackages: (projectRoot: string, layout: DesignLayout) => PackagesInfo =
  untypedLoadPackages;
export const createContext: (options: {
  program: TypeScript.Program;
  projectRoot: string;
  layout: DesignLayout;
  packagesInfo: PackagesInfo;
}) => DesignContext = untypedCreateContext;
export const isGenerated: (sourceFile: TypeScript.SourceFile) => boolean = untypedIsGenerated;
export const sharedFactFindings: (
  facts: unknown,
  options: {
    language: string;
    analyzerName: string;
    policy: unknown;
    rules: unknown;
  },
) => Finding[] = untypedSharedFactFindings;
export const DESIGN_RULES: unknown = untypedDesignRules;
