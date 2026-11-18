import { readFileSync } from 'node:fs';
import { hash as untypedHash } from '../../../../shared/rules/finding-helpers.mjs';
import {
  FRAMEWORK_BRIDGE,
  classifyTestRuntime,
  testRuntimeReport,
} from '../../../../shared/rules/test-runtime/classify.mjs';
import { evaluateTestRuntime } from '../../../../shared/rules/test-runtime/evaluate.mjs';
import {
  TEST_RUNTIME_ANALYZER,
  isEndToEndPath,
} from '../../../../shared/rules/test-runtime/scope.mjs';
import { pathInside as untypedPathInside } from '../review-rules/java-sources.mjs';
import { readDeclarations } from '../review-rules/source-declarations.mts';
import { readTestGraph, type TestProject } from './test-graph.mts';
import { isAbstract as untypedIsAbstract } from './test-sources.mjs';
import { fieldOf, listOf, textOf } from '../../../../shared/values/readers.mts';
import { callUntyped, findingsOf, type JavaFinding } from '../typed/java-values.mts';
import { completeProjects } from '../typed/complete-projects.mts';

type Judged = { readonly node: string; readonly file: string; readonly sourceHash: string };

const hash: (text: string) => string = untypedHash;
const pathInside: (root: string, file: string) => string = untypedPathInside;
const isAbstract: (text: string, simple: string, options: { kotlinOpen: boolean }) => boolean =
  untypedIsAbstract;
const isEndToEnd: (file: string) => boolean = isEndToEndPath;

const REPORTS = ['jdeps-classes.txt', 'jdeps-test.txt'];

function testRoots(project: TestProject): string[] {
  return [...(project.testSourceRoots ?? []), ...(project.kotlinTestSourceRoots ?? [])];
}

function declaredTests(
  projectRoot: string,
  projects: readonly TestProject[],
  declaring: ReadonlySet<string>,
): Judged[] {
  return projects.flatMap((project) => {
    const nodes = [...declaring].filter((node) => node.startsWith(`${project.qualifier}\0`));
    if (nodes.length === 0) {
      return [];
    }
    const declarations = readDeclarations(projectRoot, testRoots(project));
    return nodes.flatMap((node) => {
      const className = node.slice(project.qualifier.length + 1);
      const declared = declarations.get(className);
      if (declared === undefined) {
        return [];
      }
      const text = readFileSync(pathInside(projectRoot, declared.file), 'utf8');
      const simple = className.slice(className.lastIndexOf('.') + 1);
      return isAbstract(text, simple, { kotlinOpen: true })
        ? []
        : [{ node, file: declared.file, sourceHash: hash(text) }];
    });
  });
}

function findingsByFile(
  report: unknown,
  judged: readonly Judged[],
): { test: string; category: unknown; sourceHash: string }[] {
  const byNode = new Map(judged.map((test) => [test.node, test]));
  const files = new Map(
    listOf(fieldOf(report, 'findings')).flatMap((finding) => {
      const found = byNode.get(textOf(fieldOf(finding, 'test')));
      return found === undefined
        ? []
        : [
            [
              found.file,
              {
                test: found.file,
                category: fieldOf(finding, 'category'),
                sourceHash: found.sourceHash,
              },
            ] as const,
          ];
    }),
  );
  return [...files.values()].toSorted((left, right) => left.test.localeCompare(right.test));
}

export function readTestRuntimeFindings(
  projectRoot: string,
  { projects }: { projects: readonly TestProject[] },
): JavaFinding[] {
  const complete = completeProjects(projects, REPORTS);
  if (complete.length === 0) {
    return [];
  }
  const graph = readTestGraph(complete);
  const declared = declaredTests(projectRoot, complete, graph.declaring);
  const judged = declared.filter(({ file }) => !isEndToEnd(file));
  const excluded = declared.filter(({ file }) => isEndToEnd(file)).map(({ node }) => node);
  if (declared.length === 0) {
    return [];
  }
  const report: unknown = callUntyped(testRuntimeReport, {
    tests: judged.map(({ node }) => node).toSorted(),
    excluded,
    classify: (node: string) =>
      callUntyped(classifyTestRuntime, node, {
        edges: graph.edges,
        isProduction: graph.isProduction,
        bridgesOf: graph.bridgesOf,
        bridgeCategory: FRAMEWORK_BRIDGE,
      }),
  });
  return findingsOf(
    callUntyped(
      evaluateTestRuntime,
      { summary: fieldOf(report, 'summary'), findings: findingsByFile(report, judged) },
      TEST_RUNTIME_ANALYZER,
    ),
  );
}
