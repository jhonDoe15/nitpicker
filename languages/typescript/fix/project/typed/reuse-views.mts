import type TypeScript from 'typescript';
import { analyzeEntryPoints as untypedAnalyzeEntryPoints } from '../../../preset/entry-points/analyze.mjs';
import { layoutFeatures as untypedLayoutFeatures } from '../../../preset/architecture/strict-layout.mjs';
import { productionFilter as untypedProductionFilter } from '../../../preset/coupling/analyze.mjs';
import { sharedUsedByOneFeature as untypedSharedUsedByOneFeature } from '../../../preset/coupling/shared-usage.mjs';
import { createContext as untypedCreateContext } from '../../../preset/unused-api/context.mjs';
import { unusedApiFindings as untypedUnusedApiFindings } from '../../../preset/unused-api/findings.mjs';
import { collectReferences as untypedCollectReferences } from '../../../preset/unused-api/references/references.mjs';
import {
  collectTargets as untypedCollectTargets,
  registerWrapperAliases as untypedRegisterWrapperAliases,
} from '../../../preset/unused-api/syntax/declarations.mjs';
import { loadPackages as untypedLoadPackages } from '../../../preset/unused-api/workspace/packages.mjs';
import { exceptionMatcher as untypedExceptionMatcher } from '../../../../../shared/rules/exceptions.mjs';
import { layoutOf } from '../model/project-model.mts';
import { projectGraph as untypedProjectGraph } from '../model/project-graph.mts';
import { recordPlan as untypedRecordPlan } from '../plan/record-plan.mts';
import type {
  FixInputs,
  FixLayout,
  Planned,
  Project,
  ProjectFinding,
  ProjectFix,
} from './project-types.mts';

type ProjectDependency = {
  readonly resolved: string;
  readonly module: string;
  readonly dependencyTypes: readonly string[];
};

export type ProjectGraph = {
  readonly modules: readonly {
    readonly source: string;
    readonly dependencies: readonly ProjectDependency[];
  }[];
};

export type ToolFinding = {
  readonly tool: string;
  readonly rule: string;
  readonly path: string;
  readonly symbol: string;
  readonly identity: string;
  readonly location?: { readonly line: number };
};

export type UnusedTarget = {
  readonly name: string;
  readonly path: string;
  readonly kind: string;
  readonly members: ReadonlyMap<string, TypeScript.Node>;
};

export type UnusedRegistry = { readonly targets: readonly UnusedTarget[] };

type AnalysisBase = { readonly owned: unknown };

type Analysis = AnalysisBase & { readonly react: boolean };

type PackagesInfo = {
  readonly packageOf: (file: string) => { readonly published?: true } | undefined;
};

type EngineLayout = NonNullable<
  NonNullable<Parameters<typeof untypedAnalyzeEntryPoints>[2]>['layout']
>;

export type FullLayout = { readonly isTestPath: (name: string) => boolean } & FixLayout &
  Omit<EngineLayout, 'sourceRoots' | 'testRoots'>;

type PlanResult = { readonly fixes: ProjectFix[]; readonly notes: string[] };

const analyzeEntryPoints: (
  graph: ProjectGraph,
  root: string,
  options?: { readonly layout: FullLayout },
) => {
  readonly publicAlternativeBypasses: readonly {
    readonly source: string;
    readonly target: string;
    readonly publicEntryPoint: string;
  }[];
} = untypedAnalyzeEntryPoints;

const layoutFeatures: {
  readonly featureRoot: string;
  readonly feature: string;
} = untypedLayoutFeatures;

const productionFilter: (layout: FullLayout, sourceRoot: string) => (file: string) => boolean =
  untypedProductionFilter;

const sharedUsedByOneFeature: (
  graph: ProjectGraph,
  options: { readonly sourceRoot: string; readonly isProduction: (file: string) => boolean },
) => readonly { readonly source: string; readonly directory: string }[] =
  untypedSharedUsedByOneFeature;

const createContext: (settings: {
  readonly program: TypeScript.Program;
  readonly projectRoot: string;
  readonly layout: FixLayout;
  readonly packagesInfo: PackagesInfo;
}) => AnalysisBase = untypedCreateContext;

const unusedApiFindings: (
  registry: UnusedRegistry,
  context: {
    readonly owned: unknown;
    readonly analyzerName: string;
    readonly isExcepted: (rule: string, ...candidates: string[]) => boolean;
  },
) => readonly ToolFinding[] = untypedUnusedApiFindings;

const collectReferences: (context: Analysis, registry: UnusedRegistry) => void =
  untypedCollectReferences;

const collectTargets: (context: Analysis) => UnusedRegistry = untypedCollectTargets;

const registerWrapperAliases: (context: Analysis, registry: UnusedRegistry) => void =
  untypedRegisterWrapperAliases;

const loadPackages: (projectRoot: string, layout: FixLayout) => PackagesInfo = untypedLoadPackages;

const exceptionMatcher: (
  exceptions: unknown,
) => (rule: string, ...candidates: string[]) => boolean = untypedExceptionMatcher;

function isFullLayout(layout: FixLayout): layout is FullLayout {
  return typeof Reflect.get(layout, 'isSourceUnderRoot') === 'function';
}

function fullLayoutOf(inputs: FixInputs | undefined): FullLayout {
  const layout = layoutOf(inputs);
  if (!isFullLayout(layout)) {
    throw new TypeError('The project layout is missing its path matchers');
  }
  return layout;
}

const projectGraph: (project: Project) => ProjectGraph = untypedProjectGraph;

const recordPlan: (
  result: PlanResult,
  recorded: {
    readonly planned: Planned | undefined;
    readonly finding: ProjectFinding;
    readonly rule: string;
  },
) => void = untypedRecordPlan;

export {
  analyzeEntryPoints,
  collectReferences,
  collectTargets,
  createContext,
  exceptionMatcher,
  fullLayoutOf,
  layoutFeatures,
  loadPackages,
  productionFilter,
  projectGraph,
  recordPlan,
  registerWrapperAliases,
  sharedUsedByOneFeature,
  unusedApiFindings,
};
export type { PlanResult };
