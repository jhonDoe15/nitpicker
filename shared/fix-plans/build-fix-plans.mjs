import { builderForEntry, PLAN_BUILDERS } from './registry.mjs';
import { describe, without } from './plan-parts/finding.mjs';
import { entryForFinding } from '../reference/store.mjs';

function planOf(finding, builder, env) {
  const built = builder.build(finding, env);
  const { target, kind } = built;
  return {
    finding: without({
      tool: finding.tool,
      rule: finding.rule,
      path: finding.path,
      line: finding.location?.line,
    }),
    kind,
    target,
    context: built.context ?? {},
    steps: built.steps,
    doneWhen: `nitpicker reports no ${finding.tool}/${finding.rule} finding for ${describe(target)}.`,
  };
}

function attempt(finding, builder, env) {
  try {
    return planOf(finding, builder, env);
  } catch (error) {
    return { failure: String(error) };
  }
}

/**
 * One plan for each new enforceable finding whose rule has a builder. `index` is the rule
 * reference index that tells which rule a finding belongs to; `env` reads the project.
 */
export function buildFixPlans(findings, { index, env, builders = PLAN_BUILDERS }) {
  return findings
    .filter(({ classification }) => classification === 'enforceable')
    .flatMap((finding) => {
      const entry = entryForFinding(index, finding);
      const builder = entry === undefined ? undefined : builderForEntry(entry, builders);
      const plan = builder === undefined ? undefined : attempt(finding, builder, env);
      return plan === undefined || plan.failure !== undefined ? [] : [plan];
    });
}
