import { blackPlan } from './black-format-plan.mjs';
import { projectConfigFor } from './format-options.mjs';
import { ruffPlan } from './ruff-format-plan.mjs';

const PLANS = { ruff: ruffPlan, black: blackPlan };

export function ruffExclusions({ exclude }) {
  return exclude.flatMap((glob) => ['--extend-exclude', glob]);
}

export function formatterPlan(settings) {
  const { formatter, precedence, policyRoot, conventions = {} } = settings;
  const project = projectConfigFor({ formatter, precedence, policyRoot, conventions });
  return PLANS[formatter]({
    ...settings,
    ...project,
    conventions: settings.conventions ?? {},
    exclude: settings.exclude ?? [],
  });
}

export function formatCommand(context) {
  const { project, conventions, toolPrecedence, policyRoot, reportRoot, projectRoot, exclude } =
    context;
  const { formatter, targetVersion } = project;
  const plan = formatterPlan({
    formatter,
    conventions,
    precedence: toolPrecedence?.[formatter],
    policyRoot: policyRoot ?? projectRoot,
    root: projectRoot,
    targetVersion,
    reportRoot,
    exclude,
  });
  return formatter === 'black'
    ? ['black', '--check', ...plan.options, '.']
    : ['ruff', 'format', '--check', '--diff', '--no-cache', ...plan.options, '.'];
}
