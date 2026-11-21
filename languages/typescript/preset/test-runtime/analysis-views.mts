import type TypeScript from 'typescript';
import type {
  AnalysisLayout,
  Edge,
  GraphDependency,
  RuntimeReport,
  TestClassification,
} from './analysis-types.mts';
import { containedPath as untypedContainedPath } from '../../../../core/fix/tool-steps/paths/contained-path.mts';
import { escapeRegExp as untypedEscapeRegExp } from '../../../../shared/paths/glob.mts';
import { depthFirst as untypedDepthFirst } from '../../../../shared/traversal.mts';
import { syntaxChildren as untypedSyntaxChildren } from '../syntax/children.mts';
import {
  classifyTestRuntime as untypedClassifyTestRuntime,
  testRuntimeReport as untypedTestRuntimeReport,
} from '../../../../shared/rules/test-runtime/classify.mts';
import {
  isExcludedPath as untypedIsExcludedPath,
  isTypeOnlyDependency as untypedIsTypeOnlyDependency,
  normalizePath as untypedNormalizePath,
} from '../dependency-graph/cruise.mts';
import { defaultResolvedLayout } from '../layout.mts';

export const depthFirst: <T>(root: T, children: (node: T) => readonly T[]) => Iterable<T> =
  untypedDepthFirst;
export const containedPath: (root: string, name: string) => string = untypedContainedPath;
export const escapeRegExp: (text: string) => string = untypedEscapeRegExp;
export const syntaxChildren: (node: TypeScript.Node) => TypeScript.Node[] = untypedSyntaxChildren;
export const isExcludedPath: (value: string) => boolean = untypedIsExcludedPath;
export function isTypeOnlyDependency(dependency: GraphDependency): boolean {
  return untypedIsTypeOnlyDependency({
    ...dependency,
    preCompilationOnly: dependency.preCompilationOnly === true,
  });
}
export const normalizePath: (value: string) => string = untypedNormalizePath;
export const defaultLayout: AnalysisLayout = defaultResolvedLayout;
export const classifier: {
  classify(
    test: string,
    options: {
      edges: Map<string, Edge[]>;
      isProduction: (source: string) => boolean;
      bridgesOf?: ((test: string, visited: Set<string>) => string[]) | undefined;
    },
  ): TestClassification;
} = { classify: untypedClassifyTestRuntime };
export const reporter: {
  report(input: {
    tests: string[];
    excluded?: string[] | undefined;
    classify: (source: string) => TestClassification;
  }): RuntimeReport;
} = { report: untypedTestRuntimeReport };
