import { EDGE_KINDS } from '../../../../shared/rules/test-runtime/classify.mjs';
import {
  TEST_RUNTIME_ANALYZER,
  isEndToEndPath,
} from '../../../../shared/rules/test-runtime/scope.mjs';
import { moduleFileText } from '../typed/go-readers.mts';
import {
  classifyTestRuntime,
  evaluateTestRuntime,
  hash,
  testRuntimeReport,
} from '../typed/shared-readers.mts';
import type { FindingRow, GoFacts, NamedTests } from '../go-types.mts';
import type { RuntimeReport } from '../typed/shared-readers.mts';

const TEST_MAIN = 'TestMain';

function runtimeEdges(imports: GoFacts['imports']) {
  const edges = new Map<string, { target: string; kind: string }[]>();
  for (const { from, to } of imports.filter((edge) => edge.from !== edge.to)) {
    edges.set(from, [...(edges.get(from) ?? []), { target: to, kind: EDGE_KINDS.RUNTIME }]);
  }
  return edges;
}

export function goTestRuntimeReport(
  facts: Pick<GoFacts, 'modules' | 'imports'>,
  report: NamedTests,
): RuntimeReport {
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
    classify: (file: string) =>
      classifyTestRuntime(file, { edges, isProduction: (node: string) => production.has(node) }),
  });
}

export function goTestRuntimeFindings(
  context: { projectRoot: string },
  { facts, report }: { facts: Pick<GoFacts, 'modules' | 'imports'>; report: NamedTests },
): FindingRow[] {
  const runtime = goTestRuntimeReport(facts, report);
  if (runtime.summary.discoveredTests === 0) {
    return [];
  }
  return evaluateTestRuntime(
    {
      ...runtime,
      findings: runtime.findings.map((finding: { test: string }) => ({
        ...finding,
        sourceHash: hash(moduleFileText(context.projectRoot, finding.test) ?? finding.test),
      })),
    },
    TEST_RUNTIME_ANALYZER,
  );
}
