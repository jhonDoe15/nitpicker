import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { DESIGN_RULES } from '../../../../../shared/project-rules/design/design-rules.mjs';
import { fieldOf, parseJson, textOf } from '../../../../../shared/values/readers.mts';
import { sharedFactFindings as untypedFactFindings } from '../../../../../shared/rules/facts/evaluate.mjs';
import type { Finding } from '../typed/python-graph-types.mts';

type DesignReport = { readonly error?: unknown; readonly facts?: unknown };
const sharedFactFindings: (
  facts: unknown,
  options: Readonly<Record<string, unknown>>,
) => Finding[] = untypedFactFindings;

type FactsRequest = { readonly reportRoot: string };
type FindingsRequest = FactsRequest & {
  readonly analyzerName: string;
  readonly headPolicy?: Readonly<Record<string, unknown>>;
};

export const DESIGN_REPORT = 'design-facts.json';
export const DESIGN_FAILED_RULE = 'design-failed';

function designFailure(message: string, cause?: unknown): Error {
  const detail = cause instanceof Error ? `: ${cause.message}` : '';
  return Object.assign(new Error(`${message}${detail}`, { cause }), { rule: DESIGN_FAILED_RULE });
}

function reportOf(parsed: unknown): DesignReport {
  return { error: fieldOf(parsed, 'error'), facts: fieldOf(parsed, 'facts') };
}

function readReport(reportRoot: string): DesignReport | undefined {
  const file = path.join(reportRoot, DESIGN_REPORT);
  return existsSync(file) ? reportOf(parseJson(readFileSync(file, 'utf8'))) : undefined;
}

export function readDesignFacts({ reportRoot }: FactsRequest): unknown {
  const report = readReport(reportRoot);
  if (report === undefined) {
    return undefined;
  }
  if (report.error !== undefined) {
    throw designFailure(`The design facts producer failed: ${textOf(report.error)}`);
  }
  return report.facts;
}

export function designFindings({
  reportRoot,
  analyzerName,
  headPolicy = {},
}: FindingsRequest): Finding[] {
  const facts = readDesignFacts({ reportRoot });
  if (facts === undefined) {
    return [];
  }
  try {
    return sharedFactFindings(facts, {
      language: 'python',
      analyzerName,
      policy: headPolicy,
      rules: DESIGN_RULES,
    });
  } catch (error) {
    throw designFailure('The design facts of the Python sources were rejected', error);
  }
}
