import {
  ignoredConfigNotice,
  precedenceLayers,
} from '../../../../shared/conventions/tool-precedence.mjs';
import { readMypyConfig } from '../configuration/mypy-config.mjs';
import { detectTypeCheckers } from '../execution/python-project.mjs';
import { MYPY_TOOL } from './mypy-layers.mjs';
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

const MYPY_LABELS = {
  'pyproject.toml': '[tool.mypy] in pyproject.toml',
  'setup.cfg': '[mypy] in setup.cfg',
};

function mypyNotices(projectRoot, config) {
  const candidates = detectTypeCheckers(projectRoot, config.python?.typeChecker);
  const found =
    candidates.includes('mypy') && notOptedIn(config, MYPY_TOOL)
      ? readMypyConfig(projectRoot)
      : undefined;
  return found === undefined
    ? []
    : [ignoredConfigNotice(MYPY_LABELS[found.file] ?? found.file, MYPY_TOOL)];
}

export function ignoredProjectToolNotices({ config, projectRoot }) {
  try {
    return [...pyrightNotices(projectRoot, config), ...mypyNotices(projectRoot, config)];
  } catch {
    return [];
  }
}
