import path from 'node:path';
import { followed, shellCommand } from './format-options.mts';
import type { FormatPlan, RuffConfig, RuffPlanInput, ScopePattern } from './format-types.mts';

const CONFIG_FLAG = '--config';

function isBareName(pattern: string): boolean {
  return !(pattern.includes('/') || pattern.includes('\\'));
}

function patternFor(
  { pattern, directory }: ScopePattern,
  { policyRoot, root }: { readonly policyRoot: string; readonly root: string },
): string {
  const offset = path.relative(policyRoot, directory);
  if (offset === '' || isBareName(pattern) || path.isAbsolute(pattern)) {
    return pattern;
  }
  return path.resolve(root, offset, pattern).split(path.sep).join('/');
}

function scopeFlags(
  { scope }: RuffConfig,
  paths: { readonly policyRoot: string; readonly root: string },
): string[] {
  return [
    ...(scope.exclude ?? []).flatMap((entry) => ['--exclude', patternFor(entry, paths)]),
    ...scope.extendExclude.flatMap((entry) => ['--extend-exclude', patternFor(entry, paths)]),
    ...(scope.forceExclude === true ? ['--force-exclude'] : []),
  ];
}

function targetFlags({ project, optedIn, targetVersion }: RuffPlanInput): string[] {
  const own = project?.scope.targetVersion;
  if (optedIn) {
    return own === undefined ? ['--target-version', targetVersion] : [];
  }
  return ['--target-version', own ?? targetVersion];
}

function indentationFlags({ conventions, project, wins }: RuffPlanInput): string[] {
  if (wins('indentation')) {
    return [];
  }
  const indentation = followed(conventions, 'indentation');
  if (indentation === 'tab') {
    return [CONFIG_FLAG, 'format.indent-style = "tab"'];
  }
  return [
    CONFIG_FLAG,
    `indent-width = ${indentation}`,
    ...(project?.set['indentation'] === 'tab'
      ? [CONFIG_FLAG, 'format.indent-style = "space"']
      : []),
  ];
}

function styleFlags(settings: RuffPlanInput): string[] {
  const { conventions, wins } = settings;
  return [
    ...(wins('lineLength') ? [] : ['--line-length', followed(conventions, 'lineLength')]),
    ...(wins('quotes')
      ? []
      : [CONFIG_FLAG, `format.quote-style = "${followed(conventions, 'quotes')}"`]),
    ...indentationFlags(settings),
  ];
}

export function ruffPlan(settings: RuffPlanInput): FormatPlan {
  const { project, optedIn, policyRoot, exclude } = settings;
  const flags = [
    ...targetFlags(settings),
    ...styleFlags(settings),
    ...(optedIn || project === undefined ? [] : scopeFlags(project, settings)),
  ];
  function configuration(file: string | undefined): string[] {
    return file === undefined ? ['--isolated'] : [CONFIG_FLAG, file];
  }
  return {
    options: [
      ...configuration(optedIn ? project.file : undefined),
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
