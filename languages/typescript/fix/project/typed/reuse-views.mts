import type TypeScript from 'typescript';
import { analyzeEntryPoints as untypedAnalyzeEntryPoints } from '../../../preset/entry-points/analyze.mts';
import { layoutFeatures as untypedLayoutFeatures } from '../../../preset/architecture/strict-layout.mts';
import { productionFilter as untypedProductionFilter } from '../../../preset/coupling/analyze.mts';
import { sharedUsedByOneFeature as untypedSharedUsedByOneFeature } from '../../../preset/coupling/shared-usage.mts';
import { createContext } from '../../../preset/unused-api/context.mts';
import { unusedApiFindings } from '../../../preset/unused-api/findings.mts';
import { collectReferences } from '../../../preset/unused-api/references/references.mts';
import {
  collectTargets,
  registerWrapperAliases,
} from '../../../preset/unused-api/syntax/declarations.mts';
import { loadPackages } from '../../../preset/unused-api/workspace/packages.mts';
import { exceptionMatcher } from '../../../preset/unused-api/analysis-views.mts';
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

type RealFinding = ReturnType<typeof unusedApiFindings>[number];

export type ToolFinding = RealFinding & { readonly symbol: string };

export function withSymbol(finding: RealFinding): ToolFinding[] {
  return finding.symbol === undefined ? [] : [{ ...finding, symbol: finding.symbol }];
}

export type UnusedTarget = {
  readonly name: string;
  readonly path: string;
  readonly kind: string;
  readonly members: ReadonlyMap<string, TypeScript.Node>;
};

export type UnusedRegistry = ReturnType<typeof collectTargets>;

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
