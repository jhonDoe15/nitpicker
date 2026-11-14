import {
  EDGE_KINDS,
  classifyTestRuntime,
  testRuntimeReport,
} from '../../../../shared/rules/test-runtime/classify.mjs';
import { evaluateTestRuntime } from '../../../../shared/rules/test-runtime/evaluate.mjs';
import {
  TEST_RUNTIME_ANALYZER,
  isEndToEndPath,
} from '../../../../shared/rules/test-runtime/scope.mjs';
import { hash } from '../../../../shared/rules/finding-helpers.mjs';
import { moduleFileText } from '../execution/go-module.mjs';

const TEST_MAIN = 'TestMain';

function runtimeEdges(imports) {
  const edges = new Map();
  for (const { from, to } of imports.filter((edge) => edge.from !== edge.to)) {
    edges.set(from, [...(edges.get(from) ?? []), { target: to, kind: EDGE_KINDS.RUNTIME }]);
  }
  return edges;
}

export function goTestRuntimeReport(facts, report) {
  const production = new Set(
    facts.modules.filter(({ role }) => role === 'production').map(({ file }) => file),
  );
  const candidates = [
    ...new Set(report.tests.filter(({ name }) => name !== TEST_MAIN).map(({ file }) => file)),
  ].toSorted((left, right) => left.localeCompare(right));
  const excluded = candidates.filter(isEndToEndPath);
  const edges = runtimeEdges(facts.imports);
  return testRuntimeReport({
    tests: candidates.filter((file) => !isEndToEndPath(file)),
    excluded,
    classify: (file) =>
      classifyTestRuntime(file, { edges, isProduction: (node) => production.has(node) }),
  });
}

export function goTestRuntimeFindings(context, { facts, report }) {
  const runtime = goTestRuntimeReport(facts, report);
  if (runtime.summary.discoveredTests === 0) {
    return [];
  }
  return evaluateTestRuntime(
    {
      ...runtime,
      findings: runtime.findings.map((finding) => ({
        ...finding,
        sourceHash: hash(moduleFileText(context.projectRoot, finding.test) ?? finding.test),
      })),
    },
    TEST_RUNTIME_ANALYZER,
  );
}
