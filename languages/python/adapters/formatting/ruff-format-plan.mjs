import path from 'node:path';
import { followed, shellCommand } from './format-options.mjs';

function isBareName(pattern) {
  return !pattern.includes('/') && !pattern.includes('\\');
}

function patternFor({ pattern, directory }, { policyRoot, root }) {
  const offset = path.relative(policyRoot, directory);
  if (offset === '' || isBareName(pattern) || path.isAbsolute(pattern)) {
    return pattern;
  }
  return path.resolve(root, offset, pattern).split(path.sep).join('/');
}

function scopeFlags({ scope }, paths) {
  return [
    ...(scope.exclude ?? []).flatMap((entry) => ['--exclude', patternFor(entry, paths)]),
    ...scope.extendExclude.flatMap((entry) => ['--extend-exclude', patternFor(entry, paths)]),
    ...(scope.forceExclude === true ? ['--force-exclude'] : []),
  ];
}

function targetFlags({ project, optedIn, targetVersion }) {
  const own = project?.scope.targetVersion;
  if (optedIn) {
    return own === undefined ? ['--target-version', targetVersion] : [];
  }
  return ['--target-version', own ?? targetVersion];
}

function indentationFlags({ conventions, project, wins }) {
  if (wins('indentation')) {
    return [];
  }
  const indentation = followed(conventions, 'indentation');
  if (indentation === 'tab') {
    return ['--config', 'format.indent-style = "tab"'];
  }
  return [
    '--config',
    `indent-width = ${indentation}`,
    ...(project?.set.indentation === 'tab' ? ['--config', 'format.indent-style = "space"'] : []),
  ];
}

function styleFlags(settings) {
  const { conventions, wins } = settings;
  return [
    ...(wins('lineLength') ? [] : ['--line-length', followed(conventions, 'lineLength')]),
    ...(wins('quotes')
      ? []
      : ['--config', `format.quote-style = "${followed(conventions, 'quotes')}"`]),
    ...indentationFlags(settings),
  ];
}

export function ruffPlan(settings) {
  const { project, optedIn, policyRoot, exclude } = settings;
  const flags = [
    ...targetFlags(settings),
    ...styleFlags(settings),
    ...(optedIn || project === undefined ? [] : scopeFlags(project, settings)),
  ];
  function configuration(file) {
    return optedIn ? ['--config', file] : ['--isolated'];
  }
  return {
    options: [
      ...configuration(project?.file),
      ...flags,
      ...exclude.flatMap((glob) => ['--extend-exclude', glob]),
    ],
    command: shellCommand([
      'ruff',
      'format',
      ...configuration(optedIn ? path.relative(policyRoot, project.file) : undefined),
      ...flags,
      '.',
    ]),
  };
}
