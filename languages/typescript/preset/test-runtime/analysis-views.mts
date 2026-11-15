import type TypeScript from 'typescript';
import type {
  AnalysisLayout,
  Edge,
  GraphDependency,
  RuntimeReport,
  TestClassification,
} from './analysis-types.mts';
import { containedPath as untypedContainedPath } from '../../../../core/fix/common/contained-path.mjs';
import { escapeRegExp as untypedEscapeRegExp } from '../../../../shared/paths/glob.mjs';
import { depthFirst as untypedDepthFirst } from '../../../../shared/traversal.mjs';
import { syntaxChildren as untypedSyntaxChildren } from '../syntax/children.mjs';
import {
  classifyTestRuntime as untypedClassifyTestRuntime,
  testRuntimeReport as untypedTestRuntimeReport,
} from '../../../../shared/rules/test-runtime/classify.mjs';
import {
  isExcludedPath as untypedIsExcludedPath,
  isTypeOnlyDependency as untypedIsTypeOnlyDependency,
  normalizePath as untypedNormalizePath,
} from '../dependency-graph/cruise.mjs';
import { defaultResolvedLayout } from '../layout.mjs';

export const depthFirst: <T>(root: T, children: (node: T) => readonly T[]) => Iterable<T> =
  untypedDepthFirst;
export const containedPath: (root: string, name: string) => string = untypedContainedPath;
export const escapeRegExp: (text: string) => string = untypedEscapeRegExp;
export const syntaxChildren: (node: TypeScript.Node) => TypeScript.Node[] = untypedSyntaxChildren;
export const isExcludedPath: (value: string) => boolean = untypedIsExcludedPath;
export const isTypeOnlyDependency: (dependency: GraphDependency) => boolean =
  untypedIsTypeOnlyDependency;
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
