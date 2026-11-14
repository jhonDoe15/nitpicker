export const FIX_PLANS_FILE_NAME = 'fix-plans.json';

function planLine(plan) {
  const { target } = plan;
  const where = `${target.path}:${String(target.startLine)}`;
  return `${plan.finding.tool}/${plan.finding.rule} ${where} ${plan.kind}`;
}

export function planSection(plans) {
  return plans.length === 0
    ? []
    : [
        '',
        `Fix plans (steps in ${FIX_PLANS_FILE_NAME}):`,
        ...plans.map((plan) => `  ${planLine(plan)}`),
      ];
}

export function planCountLines(plans, diagnosticsPath) {
  if (plans === undefined || plans.length === 0) {
    return [];
  }
  const file = diagnosticsPath.replace(/[^/\\]*$/u, FIX_PLANS_FILE_NAME);
  return [`Fix plans: ${String(plans.length)}, see ${file}`];
}
