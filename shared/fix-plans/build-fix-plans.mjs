import { builderForEntry, PLAN_BUILDERS } from './registry.mjs';
import { describe, symbolOf, without } from './plan-parts/finding.mjs';
import { functionExtent } from './plan-parts/source.mjs';
import { withProjectIndex } from './plan-parts/test-files/project-tests.mjs';
import { entryForFinding } from '../reference/store.mjs';

function findingOf(finding) {
  return without({
    tool: finding.tool,
    rule: finding.rule,
    path: finding.path,
    line: finding.location?.line,
  });
}

function planOf(finding, builder, env) {
  const built = builder.build(finding, env);
  const { target, kind } = built;
  return {
    finding: findingOf(finding),
    kind,
    target,
    context: built.context ?? {},
    steps: built.steps,
    doneWhen: `nitpicker reports no ${finding.tool}/${finding.rule} finding for ${describe(target)}.`,
  };
}

function groupPlanOf(findings, builder, env) {
  const built = builder.buildGroup(findings, env);
  const { target, kind } = built;
  const [first] = findings;
  return {
    finding: findingOf(first),
    findings: findings.map(({ location }) =>
      without({ line: location?.line, column: location?.column }),
    ),
    kind,
    target,
    context: built.context ?? {},
    steps: built.steps,
    doneWhen: `nitpicker reports no ${first.tool}/${first.rule} finding for ${describe(target)}.`,
  };
}

function attempt(make) {
  try {
    return make();
  } catch (error) {
    return { failure: String(error) };
  }
}

function byPlace(a, b) {
  return (
    (a.location?.line ?? 0) - (b.location?.line ?? 0) ||
    (a.location?.column ?? 0) - (b.location?.column ?? 0)
  );
}

function groupKey(finding, env) {
  const extent = functionExtent(finding, symbolOf(finding), env);
  return JSON.stringify([
    finding.tool,
    finding.rule,
    finding.path,
    finding.symbol,
    extent?.startLine,
  ]);
}

function isGroupable({ finding, builder }) {
  return (
    builder.buildGroup !== undefined &&
    symbolOf(finding) !== undefined &&
    Number.isInteger(finding.location?.line)
  );
}

function collectGroups(items, env) {
  const groups = new Map();
  const ordered = [];
  for (const item of items) {
    const key = isGroupable(item) ? groupKey(item.finding, env) : undefined;
    if (key !== undefined && groups.has(key)) {
      groups.get(key).findings.push(item.finding);
    } else if (key === undefined) {
      ordered.push({ builder: item.builder, findings: [item.finding] });
    } else {
      const entry = { builder: item.builder, findings: [item.finding] };
      groups.set(key, entry);
      ordered.push(entry);
    }
  }
  return ordered;
}

function plansOf({ builder, findings }, env) {
  if (findings.length > 1) {
    const plan = attempt(() => groupPlanOf(findings.toSorted(byPlace), builder, env));
    if (plan.failure === undefined) {
      return [plan];
    }
  }
  return findings
    .map((finding) => attempt(() => planOf(finding, builder, env)))
    .filter((plan) => plan.failure === undefined);
}

/**
 * One plan for each new enforceable finding whose rule has a builder, except that findings of
 * a rule whose builder groups (surviving and unreached mutants, uncovered branches) share one plan
 * for each tool, rule, file and function. `index` is the rule reference index that tells which
 * rule a finding belongs to; `env` reads the project.
 */
export function buildFixPlans(findings, { index, env: project, builders = PLAN_BUILDERS }) {
  const env = withProjectIndex(project);
  const items = findings
    .filter(({ classification }) => classification === 'enforceable')
    .map((finding) => {
      const entry = entryForFinding(index, finding);
      return {
        finding,
        builder: entry === undefined ? undefined : builderForEntry(entry, builders),
      };
    })
    .filter(({ builder }) => builder !== undefined);
  return collectGroups(items, env).flatMap((group) => plansOf(group, env));
}
