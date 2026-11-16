import type { NitpickerConfig } from '../../../../shared/values/config-types.mts';
import {
  ignoredConfigNotice,
  precedenceLayers,
} from '../../../../shared/conventions/tool-precedence.mjs';
import {
  COVERAGE_TOOL,
  optInKeys,
  readCoverageSettings,
} from '../configuration/coverage-config/python-coverage-config.mts';
import { readMypyConfig } from '../configuration/mypy/mypy-config.mts';
import { detectTypeCheckers } from '../execution/python-project.mts';
import { ignoredMutmutKeys, MUTMUT_TOOL, readMutmutConfig } from './mutmut/mutmut-config.mts';
import { MYPY_TOOL } from './mypy-layers.mts';
import { PYRIGHT_TOOL } from './pyright/pyright-config.mts';
import { pyrightConfigLabel, readProjectPyright } from './pyright/pyright-project-config.mts';
import { attempt } from './project-tool-layers.mts';
import { retriesNotices } from '../test-runs/retries/pytest-retries.mts';

const ENVIRONMENT_NOTE = ' except its environment keys';
const MUTMUT_NOTE = ' except also_copy and its process options';

function typeCheckerSetting(config: NitpickerConfig): string | undefined {
  const setting = config.python?.['typeChecker'];
  return typeof setting === 'string' ? setting : undefined;
}

function notOptedIn(config: NitpickerConfig, tool: string): boolean {
  return !precedenceLayers(config.tools?.[tool]?.precedence).usesProject;
}

function pyrightNotices(projectRoot: string, config: NitpickerConfig): string[] {
  const checker = detectTypeCheckers(projectRoot, typeCheckerSetting(config)).find(
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

const MYPY_LABELS: Readonly<Record<string, string>> = {
  'pyproject.toml': '[tool.mypy] in pyproject.toml',
  'setup.cfg': '[mypy] in setup.cfg',
};

function mypyNotices(projectRoot: string, config: NitpickerConfig): string[] {
  const candidates = detectTypeCheckers(projectRoot, typeCheckerSetting(config));
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

const MUTMUT_LABELS: Readonly<Record<string, string>> = {
  'pyproject.toml': '[tool.mutmut] in pyproject.toml',
  'setup.cfg': '[mutmut] in setup.cfg',
};

function mutmutNotices(projectRoot: string, config: NitpickerConfig): string[] {
  const found =
    (config.disable ?? []).includes('mutation') || !notOptedIn(config, MUTMUT_TOOL)
      ? undefined
      : readMutmutConfig(projectRoot);
  return found === undefined || ignoredMutmutKeys(found.table).length === 0
    ? []
    : [
        ignoredConfigNotice(
          `${MUTMUT_LABELS[found.file] ?? found.file}${MUTMUT_NOTE}`,
          MUTMUT_TOOL,
        ),
      ];
}

const COVERAGE_NOTE = ' except concurrency, patch and plugins, which the run needs';

function coverageNotices(projectRoot: string, config: NitpickerConfig): string[] {
  const found = notOptedIn(config, COVERAGE_TOOL) ? readCoverageSettings(projectRoot) : undefined;
  return found === undefined || optInKeys(found).length === 0
    ? []
    : [ignoredConfigNotice(`${found.label}${COVERAGE_NOTE}`, COVERAGE_TOOL)];
}

export function ignoredProjectToolNotices({
  config,
  projectRoot,
}: {
  config: NitpickerConfig;
  projectRoot: string;
}): string[] {
  const { value = [] } = attempt(() => [
    ...pyrightNotices(projectRoot, config),
    ...mypyNotices(projectRoot, config),
    ...mutmutNotices(projectRoot, config),
    ...coverageNotices(projectRoot, config),
    ...retriesNotices({ config, projectRoot }),
  ]);
  return value;
}
