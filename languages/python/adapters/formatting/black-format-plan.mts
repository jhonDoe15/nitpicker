import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { globToRegExpSource as untypedGlobSource } from '../../../../shared/paths/glob.mjs';
import { EMPTY_FILE, followed, shellCommand } from './format-options.mts';
import type { BlackConfig, BlackPlanInput, FormatPlan, Wins } from './format-types.mts';

const globRegExpSource: (glob: string) => string = untypedGlobSource;

const EMPTY_CONFIG = 'nitpicker-black.toml';

function emptyConfig(reportRoot: string | undefined): string {
  if (reportRoot === undefined) {
    return EMPTY_FILE;
  }
  const file = path.join(reportRoot, EMPTY_CONFIG);
  writeFileSync(file, '');
  return file;
}

function targetFlags({ project, optedIn, targetVersion }: BlackPlanInput): string[] {
  const own = project?.scope.targetVersions;
  const declared = own !== undefined || (optedIn && project.scope.requiresPython);
  if (declared && optedIn) {
    return [];
  }
  return [own ?? targetVersion].flat().flatMap((version) => ['--target-version', version]);
}

function projectScopeFlags({ scope }: BlackConfig): string[] {
  return [
    ...(scope.exclude === undefined ? [] : ['--exclude', scope.exclude]),
    ...(scope.forceExclude === undefined ? [] : ['--force-exclude', scope.forceExclude]),
  ];
}

function nitpickerPattern(glob: string): string {
  return `^/${globRegExpSource(glob).slice(1, -1)}(?:/.*)?/?$`;
}

function extendFlags(project: BlackConfig | undefined, patterns: readonly string[]): string[] {
  const pieces = [
    project?.scope.extendExclude,
    patterns.length === 0 ? undefined : patterns.join('|'),
  ].filter((piece): piece is string => piece !== undefined);
  if (pieces.length === 0) {
    return [];
  }
  return [
    '--extend-exclude',
    pieces.length === 1 ? (pieces[0] ?? '') : pieces.map((piece) => `(?:${piece})`).join('|'),
  ];
}

function styleFlags({
  conventions,
  wins,
}: {
  readonly conventions: BlackPlanInput['conventions'];
  readonly wins: Wins;
}): string[] {
  return [
    ...(wins('lineLength') ? [] : ['--line-length', followed(conventions, 'lineLength')]),
    ...(!wins('quotes') && followed(conventions, 'quotes') === 'single'
      ? ['--skip-string-normalization']
      : []),
  ];
}

export function blackPlan(settings: BlackPlanInput): FormatPlan {
  const { project, optedIn, reportRoot, policyRoot, exclude } = settings;
  const flags = [
    ...styleFlags(settings),
    ...targetFlags(settings),
    ...(optedIn || project === undefined ? [] : projectScopeFlags(project)),
  ];
  const run = optedIn ? project.file : emptyConfig(reportRoot);
  const shown = optedIn ? path.relative(policyRoot, project.file) : EMPTY_FILE;
  function command(file: string, extend: readonly string[]): string[] {
    return ['black', '--config', file, ...flags, ...extendFlags(project, extend)];
  }
  return {
    options: command(run, exclude.map(nitpickerPattern)).slice(1),
    command: shellCommand([...command(shown, []), '.']),
  };
}
