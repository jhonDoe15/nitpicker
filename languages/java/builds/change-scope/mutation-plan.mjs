import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { isInMutationScope } from '../../../../core/scope/mutation-scope.mjs';
import { readComparisonChanges } from './comparison-changes.mjs';
import { MAX_TESTED_SOURCES, testedSources } from './tested-sources.mjs';

const MUTATION_TOOL = 'pit';
const NAMED_CAPPED = 3;

function sameDirectory(left, right) {
  return realpathSync.native(left) === realpathSync.native(right);
}

function comparisonRoots(projectRoot, policy) {
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

function withinScope(files, mutationScope) {
  return files.filter((file) => isInMutationScope(file, mutationScope));
}

function cappedNotice(capped) {
  const named = capped.slice(0, NAMED_CAPPED).join(', ');
  const rest = capped.length - NAMED_CAPPED;
  const more = rest > 0 ? ` and ${String(rest)} more` : '';
  const digest = createHash('sha256').update(capped.join('\n')).digest('hex').slice(0, 16);
  return {
    tool: MUTATION_TOOL,
    rule: 'tested-modules-capped',
    path: capped[0],
    identity: `tested-modules-capped|${digest}`,
    message:
      `The changed tests reach more than ${String(MAX_TESTED_SOURCES)} production source files, ` +
      `so weaker tests were not checked in ${named}${more}. Run \`nitpicker --all\` to mutate every class.`,
    classification: 'descriptive',
  };
}

export function comparisonMutationPlan(projectRoot, policy = {}) {
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
    return { scope: tested.sources, changedOnly: new Map(), notices: [] };
  }
  const reached = new Set(tested.sources);
  const changedOnly = new Map([...changes.sources].filter(([file]) => !reached.has(file)));
  return {
    scope: withinScope([...new Set([...changes.sources.keys(), ...reached])], policy.mutationScope),
    changedOnly,
    notices: tested.capped.length === 0 ? [] : [cappedNotice(tested.capped)],
  };
}

function onChangedLine(finding, ranges) {
  const line = finding.location?.line;
  const endLine = finding.location?.endLine ?? line;
  return line !== undefined && ranges.some(([start, end]) => start <= endLine && line <= end);
}

function plannedMutationFindings(findings, plan) {
  const kept = findings.filter((finding) => {
    const ranges = finding.tool === MUTATION_TOOL ? plan.changedOnly.get(finding.path) : undefined;
    return ranges === undefined || onChangedLine(finding, ranges);
  });
  return [...kept, ...plan.notices];
}

export function mutationPlanOf(projectRoot, options) {
  const plan = comparisonMutationPlan(projectRoot, options.policy);
  return plan === undefined
    ? { options, findings: (findings) => findings }
    : {
        options: { ...options, policy: { ...options.policy, mutationScope: plan.scope } },
        findings: (findings) => plannedMutationFindings(findings, plan),
      };
}
