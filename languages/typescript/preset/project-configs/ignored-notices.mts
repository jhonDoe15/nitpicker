import { fieldOf, messageOf } from '../../../../shared/values/readers.mts';
import { ignoredConfigNotice, precedenceLayers } from '../project-tools/typed/shared-views.mts';
import type { ToolPolicy } from '../project-tools/typed/tool-types.mts';
import { resolveLayoutFor } from '../layout.mts';
import { filesLeftOutsideRootDir } from '../tool-configs.mts';
import { mutationDisabled, STRYKER_TOOL, strykerProjectFile } from './stryker-project-config.mts';
import {
  TYPESCRIPT_TOOL,
  relaxedStrictOptions,
  solutionResolution,
} from './typescript/typescript-project-options.mts';

export function strykerIgnoredNotices({
  config,
  projectRoot,
}: {
  readonly config: ToolPolicy;
  readonly projectRoot: string;
}): string[] {
  if (
    mutationDisabled(config) ||
    precedenceLayers(config.tools?.[STRYKER_TOOL]?.precedence).usesProject
  ) {
    return [];
  }
  const file = strykerProjectFile(projectRoot);
  return file === undefined ? [] : [ignoredConfigNotice(file, STRYKER_TOOL)];
}

function relaxedNotice(config: ToolPolicy, projectRoot: string): string[] {
  try {
    const { file, relaxed } = relaxedStrictOptions(projectRoot, resolveLayoutFor(config));
    return relaxed.length === 0
      ? []
      : [ignoredConfigNotice(`${relaxed.join(', ')} in ${String(file)}`, TYPESCRIPT_TOOL)];
  } catch (error) {
    return [`Could not check the tsconfig for relaxed strict options: ${messageOf(error)}`];
  }
}

function solutionNotice(config: ToolPolicy, projectRoot: string): string[] {
  const layout = resolveLayoutFor(config);
  const found = solutionResolution(projectRoot, layout);
  if (found === undefined) {
    return [];
  }
  const reasons = [
    found.tests > 0 ? 'it includes the test files' : 'it includes the source files',
    ...(filesLeftOutsideRootDir(projectRoot, layout).length === 0
      ? []
      : ['files outside its rootDir are not checked']),
    ...(found.typesFrom.length === 0 ? [] : [`types merged from ${found.typesFrom.join(', ')}`]),
  ];
  const why = reasons.join('; ');
  return [`TypeScript: solution ${found.from} resolved to ${found.file} (${why})`];
}

export function typescriptIgnoredNotices({
  config,
  projectRoot,
}: {
  readonly config: ToolPolicy;
  readonly projectRoot: string;
}): string[] {
  const settings = config.tools?.[TYPESCRIPT_TOOL];
  if (fieldOf(settings, 'project') !== undefined) {
    return [];
  }
  return [
    ...solutionNotice(config, projectRoot),
    ...(precedenceLayers(settings?.precedence).usesProject
      ? []
      : relaxedNotice(config, projectRoot)),
  ];
}
