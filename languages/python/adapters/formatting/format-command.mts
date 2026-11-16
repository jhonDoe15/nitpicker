import { fieldsOf, textOf } from '../../../../shared/values/readers.mts';
import { blackPlan } from './black-format-plan.mts';
import { blackProject, ruffProject } from './format-options.mts';
import { ruffPlan } from './ruff-format-plan.mts';
import type { FormatContext, FormatPlan } from './format-types.mts';

const BLACK = 'black';

export function ruffExclusions({ exclude }: { readonly exclude: readonly string[] }): string[] {
  return exclude.flatMap((glob) => ['--extend-exclude', glob]);
}

function precedenceOf(value: unknown): string[] | undefined {
  return Array.isArray(value) ? value.map(textOf) : undefined;
}

export function formatterPlan(settings: Readonly<Record<string, unknown>>): FormatPlan {
  const formatter = textOf(settings['formatter']);
  const request = {
    formatter,
    precedence: precedenceOf(settings['precedence']),
    policyRoot: textOf(settings['policyRoot']),
    conventions: settings['conventions'],
  };
  const common = {
    formatter,
    conventions: fieldsOf(settings['conventions']),
    policyRoot: request.policyRoot,
    root: textOf(settings['root']),
    targetVersion: textOf(settings['targetVersion']),
    reportRoot: typeof settings['reportRoot'] === 'string' ? settings['reportRoot'] : undefined,
    exclude: Array.isArray(settings['exclude']) ? settings['exclude'].map(textOf) : [],
  };
  if (formatter === BLACK) {
    return blackPlan({ ...common, ...blackProject(request) });
  }
  if (formatter === 'ruff') {
    return ruffPlan({ ...common, ...ruffProject(request) });
  }
  throw new Error(`Unknown formatter: ${formatter}`);
}

export function contextFormatPlan(context: FormatContext): FormatPlan {
  const { project, conventions, toolPrecedence, policyRoot, reportRoot, projectRoot, exclude } =
    context;
  const { formatter, targetVersion } = project;
  return formatterPlan({
    formatter,
    conventions,
    precedence: toolPrecedence?.[formatter],
    policyRoot: policyRoot ?? projectRoot,
    root: projectRoot,
    targetVersion,
    reportRoot,
    exclude,
  });
}

export function formatCommand(context: FormatContext): string[] {
  const plan = contextFormatPlan(context);
  return context.project.formatter === BLACK
    ? [BLACK, '--check', ...plan.options, '.']
    : ['ruff', 'format', '--check', '--diff', '--no-cache', ...plan.options, '.'];
}
