import { globToRegExpSource } from '../../../../shared/glob.mjs';
import { formatterPlan } from './format-options.mjs';

export function ruffExclusions({ exclude }) {
  return exclude.flatMap((glob) => ['--extend-exclude', glob]);
}

function blackExclusions({ exclude }) {
  if (exclude.length === 0) {
    return [];
  }
  const patterns = exclude.map((glob) => `^/${globToRegExpSource(glob).slice(1, -1)}(?:/.*)?/?$`);
  return ['--extend-exclude', patterns.join('|')];
}

export function formatCommand(context) {
  const { project, conventions, toolPrecedence, policyRoot, reportRoot, projectRoot } = context;
  const { formatter, targetVersion } = project;
  const plan = formatterPlan({
    formatter,
    conventions,
    precedence: toolPrecedence?.[formatter],
    policyRoot: policyRoot ?? projectRoot,
    targetVersion,
    reportRoot,
  });
  const command =
    formatter === 'black'
      ? ['black', '--check', ...plan.options, ...blackExclusions(context), '.']
      : [
          'ruff',
          'format',
          '--check',
          '--diff',
          '--no-cache',
          ...plan.options,
          ...ruffExclusions(context),
          '.',
        ];
  return { command, advice: plan.advice };
}
