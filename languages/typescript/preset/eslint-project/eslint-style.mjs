import {
  ignoredConfigNotice,
  precedenceLayers,
} from '../../../../shared/conventions/tool-precedence.mjs';
import { projectEslintConfig } from './project-config.mjs';

function ignoredEslintConfigNotices({ config, projectRoot }) {
  const settings = config.tools?.eslint;
  if (projectRoot === undefined || precedenceLayers(settings?.precedence).usesProject) {
    return [];
  }
  const file = projectEslintConfig(projectRoot);
  return file === undefined ? [] : [ignoredConfigNotice(file, 'eslint', settings)];
}

export function eslintConfigStyle(context) {
  return {
    unused: {},
    project: {},
    note: () => undefined,
    summary: () => ignoredEslintConfigNotices(context),
  };
}
