import { globToRegExpSource } from '../../../../shared/glob.mjs';
import { formatterConventionArguments } from '../configuration/python-format-options.mjs';

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

export function formatCommand({ project, conventions, ...context }) {
  const options = formatterConventionArguments({
    formatter: project.formatter,
    conventions,
    projectRoot: context.projectRoot,
  });
  return project.formatter === 'black'
    ? ['black', '--check', ...options, ...blackExclusions(context), '.']
    : [
        'ruff',
        'format',
        '--check',
        '--diff',
        '--no-cache',
        ...options,
        ...ruffExclusions(context),
        '.',
      ];
}
