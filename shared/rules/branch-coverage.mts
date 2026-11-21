import { MESSAGES, MINIMUM_BRANCH_COVERAGE, RULE_IDS, renderMessage } from '../policy.mts';
import type { Finding } from '../values/findings.mts';
import { numberOr, textOf, textsOf } from '../values/readers.mts';
import { positiveInteger } from './finding-parts.mts';
import { exceptionRoute } from '../exceptions/rule-names.mts';

type Branch = {
  readonly path?: unknown;
  readonly key?: unknown;
  readonly percent?: unknown;
  readonly arms?: unknown;
  readonly symbol?: unknown;
  readonly anchor?: unknown;
  readonly line?: unknown;
};

type BranchOptions = {
  readonly tool: string;
  readonly identify: (key: string, occurrence: number) => string;
  readonly minimum?: number;
};

export function branchCoverageFindings(
  branches: readonly Branch[],
  { tool, identify, minimum = MINIMUM_BRANCH_COVERAGE }: BranchOptions,
): Finding[] {
  const occurrences = new Map<string, number>();
  const findings: Finding[] = [];
  for (const branch of branches) {
    if (numberOr(branch.percent, Number.NaN) >= minimum) {
      continue;
    }
    const counterKey = JSON.stringify([branch.path, branch.key]);
    const occurrence = (occurrences.get(counterKey) ?? 0) + 1;
    occurrences.set(counterKey, occurrence);
    findings.push({
      tool,
      rule: RULE_IDS.changedBranchCoverage,
      path: textOf(branch.path),
      identity: identify(textOf(branch.key), occurrence),
      message: `${branchMessage(branch, minimum)} ${acceptSentence(branch)}`,
      allowedForm: branchAllowedForm(branch),
      classification: 'enforceable',
      ...(isNamed(branch) ? { symbol: textOf(branch.symbol) } : {}),
      anchor: { key: `branch:${textOf(branch.anchor ?? branch.key)}`, requireUnchangedLine: true },
      ...locationOf(branch),
    });
  }
  return findings;
}

const UNTESTED_OUTCOMES = 'Add a test for each outcome it misses.';
const UNTAKEN_ARMS = "Test it, or remove it if it can't happen.";

function locationOf(branch: Branch): { location?: { line: number } } {
  const line = positiveInteger(branch.line);
  return line === undefined ? {} : { location: { line } };
}

function hasArms(branch: Branch): boolean {
  return Array.isArray(branch.arms) && branch.arms.length > 0;
}

function branchAllowedForm(branch: Branch): string {
  return hasArms(branch) ? UNTAKEN_ARMS : UNTESTED_OUTCOMES;
}

function branchMessage(branch: Branch, minimum: number): string {
  const message = renderMessage(MESSAGES.changedBranchCoverage, {
    percent: numberOr(branch.percent, Number.NaN).toFixed(2),
    minimum,
  });
  return hasArms(branch)
    ? `${message}. Not taken: ${textsOf(branch.arms).join('; ')}. ${UNTAKEN_ARMS}`
    : `${message}. ${UNTESTED_OUTCOMES}`;
}

function isNamed(branch: Branch): boolean {
  return typeof branch.symbol === 'string' && branch.symbol !== '';
}

function acceptSentence(branch: Branch): string {
  return isNamed(branch)
    ? textOf(
        exceptionRoute({
          rule: RULE_IDS.changedBranchCoverage,
          path: textOf(branch.path),
          function: textOf(branch.symbol),
          name: undefined,
          key: undefined,
        }),
      )
    : 'To accept the file, add it to "exclude" in nitpicker.config.json.';
}
