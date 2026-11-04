import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { DESIGN_RULES } from '../../../../../shared/project-rules/design/design-rules.mjs';
import { sharedFactFindings } from '../../../../../shared/rules/facts/evaluate.mjs';

export const DESIGN_REPORT = 'design-facts.json';
export const DESIGN_FAILED_RULE = 'design-failed';

function designFailure(message, cause) {
  const detail = cause instanceof Error ? `: ${cause.message}` : '';
  return Object.assign(new Error(`${message}${detail}`, { cause }), { rule: DESIGN_FAILED_RULE });
}

function readReport(reportRoot) {
  const file = path.join(reportRoot, DESIGN_REPORT);
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : undefined;
}

export function readDesignFacts({ reportRoot }) {
  const report = readReport(reportRoot);
  if (report === undefined) {
    return undefined;
  }
  if (report.error !== undefined) {
    throw designFailure(`The design facts producer failed: ${report.error}`);
  }
  return report.facts;
}

export function designFindings({ reportRoot, analyzerName, headPolicy = {} }) {
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
