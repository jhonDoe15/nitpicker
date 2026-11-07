import {
  ignoredConfigNotice,
  precedenceLayers,
} from '../../../../shared/conventions/tool-precedence.mjs';
import { resolveLayoutFor } from '../layout.mjs';
import { mutationDisabled, STRYKER_TOOL, strykerProjectFile } from './stryker-project-config.mjs';
import { TYPESCRIPT_TOOL, relaxedStrictOptions } from './typescript/typescript-project-options.mjs';

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

export function typescriptIgnoredNotices({ config, projectRoot }) {
  const settings = config.tools?.[TYPESCRIPT_TOOL];
  return precedenceLayers(settings?.precedence).usesProject || settings?.project !== undefined
    ? []
    : relaxedNotice(config, projectRoot);
}
