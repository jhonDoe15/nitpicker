import {
  ignoredConfigNotice,
  precedenceLayers,
} from '../../../../shared/conventions/tool-precedence.mjs';
import { projectEslintConfig } from './project-config.mjs';

export function ignoredEslintConfigNotices({ config, projectRoot }) {
  if (projectRoot === undefined || precedenceLayers(config.tools?.eslint?.precedence).usesProject) {
    return [];
  }
  const file = projectEslintConfig(projectRoot);
  return file === undefined ? [] : [ignoredConfigNotice(file, 'eslint')];
}

export function typescriptProjectStyle(context) {
  return {
    unused: {},
    project: {},
    note: () => undefined,
    summary: () => ignoredEslintConfigNotices(context),
  };
}
