import { existsSync, readFileSync } from 'node:fs';
import { hash } from '../../../../shared/rules/finding-helpers.mjs';
import {
  FRAMEWORK_BRIDGE,
  classifyTestRuntime,
  testRuntimeReport,
} from '../../../../shared/rules/test-runtime/classify.mjs';
import { evaluateTestRuntime } from '../../../../shared/rules/test-runtime/evaluate.mjs';
import { pathInside } from '../review-rules/java-sources.mjs';
import { readDeclarations } from '../review-rules/source-declarations.mjs';
import { readTestGraph } from './test-graph.mjs';
import { isAbstract, isEndToEndPath } from './test-sources.mjs';

const TEST_RUNTIME_TOOL = 'test-runtime';
const REPORTS = ['jdeps-classes.txt', 'jdeps-test.txt'];

function testRoots(project) {
  return [...(project.testSourceRoots ?? []), ...(project.kotlinTestSourceRoots ?? [])];
}

function declaredTests(projectRoot, projects, declaring) {
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

function findingsByFile(report, judged) {
  const byNode = new Map(judged.map((test) => [test.node, test]));
  const files = new Map(
    report.findings.map(({ test, category }) => [
      byNode.get(test).file,
      { test: byNode.get(test).file, category, sourceHash: byNode.get(test).sourceHash },
    ]),
  );
  return [...files.values()].toSorted((left, right) => left.test.localeCompare(right.test));
}

export function readTestRuntimeFindings(projectRoot, { projects }) {
  const complete = projects.filter(({ reportRoot }) =>
    REPORTS.every((name) => existsSync(pathInside(reportRoot, name))),
  );
  if (complete.length === 0 || complete.length !== projects.length) {
    return [];
  }
  const graph = readTestGraph(complete);
  const declared = declaredTests(projectRoot, complete, graph.declaring);
  const judged = declared.filter(({ file }) => !isEndToEndPath(file));
  const excluded = declared.filter(({ file }) => isEndToEndPath(file)).map(({ node }) => node);
  if (declared.length === 0) {
    return [];
  }
  const report = testRuntimeReport({
    tests: judged.map(({ node }) => node).toSorted(),
    excluded,
    classify: (node) =>
      classifyTestRuntime(node, {
        edges: graph.edges,
        isProduction: graph.isProduction,
        bridgesOf: graph.bridgesOf,
        bridgeCategory: FRAMEWORK_BRIDGE,
      }),
  });
  return evaluateTestRuntime(
    { summary: report.summary, findings: findingsByFile(report, judged) },
    TEST_RUNTIME_TOOL,
  );
}
