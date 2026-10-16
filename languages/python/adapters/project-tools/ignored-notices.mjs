import {
  ignoredConfigNotice,
  precedenceLayers,
} from '../../../../shared/conventions/tool-precedence.mjs';
import { readMypyConfig } from '../configuration/mypy-config.mjs';
import { detectTypeCheckers } from '../execution/python-project.mjs';
import { ignoredMutmutKeys, MUTMUT_TOOL, readMutmutConfig } from './mutmut/mutmut-config.mjs';
import { MYPY_TOOL } from './mypy-layers.mjs';
import { PYRIGHT_TOOL } from './pyright/pyright-config.mjs';
import { pyrightConfigLabel, readProjectPyright } from './pyright/pyright-project-config.mjs';
import { attempt } from './project-tool-layers.mjs';

const ENVIRONMENT_NOTE = ' except its environment keys';
const MUTMUT_NOTE = ' except also_copy and its process options';

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
    : [
        ignoredConfigNotice(
          `${pyrightConfigLabel(found, projectRoot)}${ENVIRONMENT_NOTE}`,
          PYRIGHT_TOOL,
        ),
      ];
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
    : [
        ignoredConfigNotice(
          `${MYPY_LABELS[found.file] ?? found.file}${ENVIRONMENT_NOTE}`,
          MYPY_TOOL,
        ),
      ];
}

const MUTMUT_LABELS = {
  'pyproject.toml': '[tool.mutmut] in pyproject.toml',
  'setup.cfg': '[mutmut] in setup.cfg',
};

function mutmutNotices(projectRoot, config) {
  const found =
    (config.disable ?? []).includes('mutation') || !notOptedIn(config, MUTMUT_TOOL)
      ? undefined
      : readMutmutConfig(projectRoot);
  return found === undefined || ignoredMutmutKeys(found.table).length === 0
    ? []
    : [ignoredConfigNotice(`${MUTMUT_LABELS[found.file]}${MUTMUT_NOTE}`, MUTMUT_TOOL)];
}

export function ignoredProjectToolNotices({ config, projectRoot }) {
  const { value = [] } = attempt(() => [
    ...pyrightNotices(projectRoot, config),
    ...mypyNotices(projectRoot, config),
    ...mutmutNotices(projectRoot, config),
  ]);
  return value;
}
