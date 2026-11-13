import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { isInMutationScope } from '../../../../core/scope/mutation-scope.mjs';
import { readComparisonChanges } from './comparison-changes.mts';
import { MAX_TESTED_SOURCES, testedSources } from './tested-sources.mts';
import type { ComparisonRoots, LineRange } from './comparison-changes.mts';
import type { JavaFinding, JavaPolicy } from '../../adapters/typed/java-values.mts';
import type { JavaRunOptions } from '../../adapters/typed/java-run-options.mts';

type MutationPlan = {
  readonly scope: string[];
  readonly changedOnly: Map<string, LineRange[]>;
  readonly notices: JavaFinding[];
};
type PlannedRun = {
  readonly options: JavaRunOptions;
  readonly findings: (findings: readonly JavaFinding[]) => readonly JavaFinding[];
};

const MUTATION_TOOL = 'pit';
const SUMMARY_RULE = 'mutation-summary';
const NAMED_CAPPED = 3;
const DIGEST_LENGTH = 16;

function sameDirectory(left: string, right: string): boolean {
  return realpathSync.native(left) === realpathSync.native(right);
}

function comparisonRoots(projectRoot: string, policy: JavaPolicy): ComparisonRoots | undefined {
  if (policy.quick === true) {
    return undefined;
  }
  if (policy.snapshot === 'base') {
    const head = policy.policyRoot;
    return head === undefined || sameDirectory(head, projectRoot)
      ? undefined
      : { base: projectRoot, head };
  }
  return policy.baselineRoot === undefined
    ? undefined
    : { base: policy.baselineRoot, head: projectRoot };
}

function withinScope(files: readonly string[], mutationScope: unknown): string[] {
  return files.filter((file) => isInMutationScope(file, mutationScope) === true);
}

function cappedNotice(capped: readonly string[]): JavaFinding {
  const named = capped.slice(0, NAMED_CAPPED).join(', ');
  const rest = capped.length - NAMED_CAPPED;
  const more = rest > 0 ? ` and ${String(rest)} more` : '';
  const digest = createHash('sha256')
    .update(capped.join('\n'))
    .digest('hex')
    .slice(0, DIGEST_LENGTH);
  return {
    tool: MUTATION_TOOL,
    rule: 'tested-modules-capped',
    path: capped[0] ?? '.',
    identity: `tested-modules-capped|${digest}`,
    message:
      `The changed tests reach more than ${String(MAX_TESTED_SOURCES)} production source files, ` +
      `so weaker tests were not checked in ${named}${more}. Run \`nitpicker --all\` to mutate every class.`,
    classification: 'descriptive',
  };
}

export function comparisonMutationPlan(
  projectRoot: string,
  policy: JavaPolicy = {},
): MutationPlan | undefined {
  const roots = comparisonRoots(projectRoot, policy);
  if (roots === undefined) {
    return undefined;
  }
  const changes = readComparisonChanges(roots);
  if (changes === undefined) {
    return undefined;
  }
  const tested = testedSources(changes.tests, roots);
  if (policy.snapshot === 'base') {
    const toBase = new Map(changes.renames.map(([from, to]) => [to, from]));
    return {
      scope: [...new Set(tested.sources.map((file) => toBase.get(file) ?? file))],
      changedOnly: new Map<string, LineRange[]>(),
      notices: [],
    };
  }
  const toHead = new Map(changes.renames);
  const reached = new Set(tested.sources.map((file) => toHead.get(file) ?? file));
  const changedOnly = new Map([...changes.sources].filter(([file]) => !reached.has(file)));
  return {
    scope: withinScope(
      [...new Set([...changes.sources.keys(), ...reached])],
      policy['mutationScope'],
    ),
    changedOnly,
    notices: tested.capped.length === 0 ? [] : [cappedNotice(tested.capped)],
  };
}

function onChangedLine(finding: JavaFinding, ranges: readonly LineRange[]): boolean {
  const line = finding.location?.line;
  if (line === undefined) {
    return false;
  }
  const endLine = finding.location?.endLine ?? line;
  return ranges.some(([start, end]) => start <= endLine && line <= end);
}

function isPlannedMutant(finding: JavaFinding, plan: MutationPlan): boolean {
  if (finding.tool !== MUTATION_TOOL) {
    return true;
  }
  if (finding.rule === SUMMARY_RULE) {
    return false;
  }
  const ranges = plan.changedOnly.get(finding.path);
  return ranges === undefined || onChangedLine(finding, ranges);
}

function plannedMutationFindings(
  findings: readonly JavaFinding[],
  plan: MutationPlan,
): JavaFinding[] {
  const kept = findings.filter((finding) => isPlannedMutant(finding, plan));
  return [...kept, ...plan.notices];
}

export function mutationPlanOf(projectRoot: string, options: JavaRunOptions): PlannedRun {
  const plan = comparisonMutationPlan(projectRoot, options.policy);
  return plan === undefined
    ? { options, findings: (findings) => findings }
    : {
        options: { ...options, policy: { ...options.policy, mutationScope: plan.scope } },
        findings: (findings) => plannedMutationFindings(findings, plan),
      };
}
