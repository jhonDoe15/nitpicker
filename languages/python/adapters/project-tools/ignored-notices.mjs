import {
  ignoredConfigNotice,
  precedenceLayers,
} from '../../../../shared/conventions/tool-precedence.mjs';
import { detectTypeCheckers } from '../execution/python-project.mjs';
import { PYRIGHT_TOOL } from './pyright-config.mjs';
import { pyrightConfigLabel, readProjectPyright } from './pyright-project-config.mjs';

function notOptedIn(config, tool) {
  return !precedenceLayers(config.tools?.[tool]?.precedence).usesProject;
}

function pyrightNotices(projectRoot, config) {
  const checker = detectTypeCheckers(projectRoot, config.python?.typeChecker).find(
    (candidate) => candidate !== 'mypy',
  );
  const found =
    checker === undefined || !notOptedIn(config, PYRIGHT_TOOL)
      ? undefined
      : readProjectPyright(projectRoot, checker);
  return found === undefined
    ? []
    : [ignoredConfigNotice(pyrightConfigLabel(found, projectRoot), PYRIGHT_TOOL)];
}

export function ignoredProjectToolNotices({ config, projectRoot }) {
  try {
    return [...pyrightNotices(projectRoot, config)];
  } catch {
    return [];
  }
}
