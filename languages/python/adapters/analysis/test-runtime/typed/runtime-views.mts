import {
  classifyTestRuntime as untypedClassify,
  testRuntimeReport as untypedReport,
} from '../../../../../../shared/rules/test-runtime/classify.mjs';
import { evaluateTestRuntime as untypedEvaluate } from '../../../../../../shared/rules/test-runtime/evaluate.mjs';
import { callUntyped as call } from '../../../../../../shared/values/boundaries/untyped-call.mts';
import { fieldOf } from '../../../../../../shared/values/readers.mts';
import type { IngestedFinding } from '../../../../ingest/typed/ingest-types.mts';
import type { GraphEdge, RuntimeClassification, TestRuntimeReport } from './runtime-types.mts';

function isClassification(value: unknown): value is RuntimeClassification {
  return (
    typeof fieldOf(value, 'test') === 'string' && typeof fieldOf(value, 'category') === 'string'
  );
}

function isReport(value: unknown): value is TestRuntimeReport {
  return (
    typeof fieldOf(fieldOf(value, 'summary'), 'discoveredTests') === 'number' &&
    Array.isArray(fieldOf(value, 'tests')) &&
    Array.isArray(fieldOf(value, 'findings'))
  );
}

export function classifyTestRuntime(
  test: string,
  options: {
    edges: ReadonlyMap<string, readonly GraphEdge[]>;
    isProduction: (node: string) => boolean;
    bridgesOf: (test: string, visited: Set<string>) => string[];
    bridgeCategory: string;
  },
): RuntimeClassification {
  const classified = call(untypedClassify, test, options);
  if (!isClassification(classified)) {
    throw new TypeError('The test runtime classification is malformed');
  }
  return classified;
}

export function testRuntimeReport(input: {
  tests: string[];
  excluded: string[];
  classify: (file: string) => RuntimeClassification;
}): TestRuntimeReport {
  const report = call(untypedReport, input);
  if (!isReport(report)) {
    throw new TypeError('The test runtime report is malformed');
  }
  return report;
}

export const evaluateTestRuntime: (
  report: TestRuntimeReport,
  analyzerName: string,
) => IngestedFinding[] = untypedEvaluate;
