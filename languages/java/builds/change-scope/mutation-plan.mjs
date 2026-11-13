import { createHash } from 'node:crypto';
import { isInMutationScope } from '../../../../core/scope/mutation-scope.mjs';
import { comparisonRoots, readComparisonChanges } from './comparison-changes.mjs';
import { MAX_TESTED_SOURCES, testedSources } from './tested-sources.mjs';

const MUTATION_TOOL = 'pit';
const SUMMARY_RULE = 'mutation-summary';
const NAMED_CAPPED = 3;
const DIGEST_LENGTH = 16;

function withinScope(files, mutationScope) {
  return files.filter((file) => isInMutationScope(file, mutationScope));
}

function cappedNotice(capped) {
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
    path: capped[0],
    identity: `tested-modules-capped|${digest}`,
    message:
      `The changed tests reach more than ${String(MAX_TESTED_SOURCES)} production source files, ` +
      `so weaker tests were not checked in ${named}${more}. Run \`nitpicker --all\` to mutate every class.`,
    classification: 'descriptive',
  };
}

export function comparisonMutationPlan(projectRoot, policy = {}) {
  const roots = policy.quick === true ? undefined : comparisonRoots(projectRoot, policy);
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
      changedOnly: new Map(),
      notices: [],
    };
  }
  const toHead = new Map(changes.renames);
  const reached = new Set(tested.sources.map((file) => toHead.get(file) ?? file));
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

function isPlannedMutant(finding, plan) {
  if (finding.tool !== MUTATION_TOOL) {
    return true;
  }
  if (finding.rule === SUMMARY_RULE) {
    return false;
  }
  const ranges = plan.changedOnly.get(finding.path);
  return ranges === undefined || onChangedLine(finding, ranges);
}

function plannedMutationFindings(findings, plan) {
  const kept = findings.filter((finding) => isPlannedMutant(finding, plan));
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
