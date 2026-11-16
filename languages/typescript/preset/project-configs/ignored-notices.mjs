import {
  ignoredConfigNotice,
  precedenceLayers,
} from '../../../../shared/conventions/tool-precedence.mjs';
import { resolveLayoutFor } from '../layout.mjs';
import { filesLeftOutsideRootDir } from '../tool-configs.mjs';
import { mutationDisabled, STRYKER_TOOL, strykerProjectFile } from './stryker-project-config.mjs';
import {
  TYPESCRIPT_TOOL,
  relaxedStrictOptions,
  solutionResolution,
} from './typescript/typescript-project-options.mjs';

export function strykerIgnoredNotices({ config, projectRoot }) {
  if (
    mutationDisabled(config) ||
    precedenceLayers(config.tools?.[STRYKER_TOOL]?.precedence).usesProject
  ) {
    return [];
  }
  const file = strykerProjectFile(projectRoot);
  return file === undefined ? [] : [ignoredConfigNotice(file, STRYKER_TOOL)];
}

function relaxedNotice(config, projectRoot) {
  try {
    const { file, relaxed } = relaxedStrictOptions(projectRoot, resolveLayoutFor(config));
    return relaxed.length === 0
      ? []
      : [ignoredConfigNotice(`${relaxed.join(', ')} in ${file}`, TYPESCRIPT_TOOL)];
  } catch (error) {
    return [`Could not check the tsconfig for relaxed strict options: ${error.message}`];
  }
}

function solutionNotice(config, projectRoot) {
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

export function typescriptIgnoredNotices({ config, projectRoot }) {
  const settings = config.tools?.[TYPESCRIPT_TOOL];
  if (settings?.project !== undefined) {
    return [];
  }
  return [
    ...solutionNotice(config, projectRoot),
    ...(precedenceLayers(settings?.precedence).usesProject
      ? []
      : relaxedNotice(config, projectRoot)),
  ];
}
