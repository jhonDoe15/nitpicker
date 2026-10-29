import path from 'node:path';
import {
  ignoredConfigNotice,
  precedenceLayers,
} from '../../../../shared/conventions/tool-precedence.mjs';
import { resolveLayoutFor } from '../layout.mjs';
import { STRYKER_TOOL, strykerProjectFile } from './stryker-project-config.mjs';
import { TESTS_TOOL, retryingConfigFiles } from './test-runner-config.mjs';
import { parsedTsconfig } from '../modules/tsconfig-files.mjs';
import {
  TYPESCRIPT_TOOL,
  extendedProjectTsconfig,
  strictCompilerOptions,
} from './typescript-project-options.mjs';

function optedIn(config, tool) {
  return precedenceLayers(config.tools?.[tool]?.precedence).usesProject;
}

function strykerNotices(config, projectRoot) {
  if ((config.disable ?? []).includes('mutation') || optedIn(config, STRYKER_TOOL)) {
    return [];
  }
  const file = strykerProjectFile(projectRoot);
  return file === undefined ? [] : [ignoredConfigNotice(file, STRYKER_TOOL)];
}

function relaxedStrictOptions(config, projectRoot) {
  const layout = resolveLayoutFor(config);
  const strict = strictCompilerOptions(layout.javascript);
  const extended = extendedProjectTsconfig(projectRoot, layout);
  if (extended === undefined) {
    return { relaxed: [] };
  }
  try {
    const { options } = parsedTsconfig(path.join(projectRoot, extended));
    const relaxed = Object.keys(strict).filter(
      (key) => options[key] !== undefined && options[key] !== strict[key],
    );
    return {
      file: extended.slice(2),
      relaxed: relaxed.map((key) => `${key}: ${String(options[key])}`),
    };
  } catch {
    return { relaxed: [] };
  }
}

function typescriptNotices(config, projectRoot) {
  if (optedIn(config, TYPESCRIPT_TOOL) || config.tools?.typescript?.project !== undefined) {
    return [];
  }
  const { file, relaxed } = relaxedStrictOptions(config, projectRoot);
  return relaxed.length === 0
    ? []
    : [ignoredConfigNotice(`${relaxed.join(', ')} in ${file}`, TYPESCRIPT_TOOL)];
}

function testsNotices(config, projectRoot) {
  if ((config.disable ?? []).includes('coverage') || optedIn(config, TESTS_TOOL)) {
    return [];
  }
  return retryingConfigFiles(projectRoot).map(({ setting, file }) =>
    ignoredConfigNotice(`${setting} in ${file}`, TESTS_TOOL),
  );
}

export function ignoredScriptToolNotices({ config, projectRoot }) {
  return [
    ...typescriptNotices(config, projectRoot),
    ...strykerNotices(config, projectRoot),
    ...testsNotices(config, projectRoot),
  ];
}

export function scriptProjectStyle(context) {
  return {
    unused: {},
    project: {},
    note: () => undefined,
    summary: () => ignoredScriptToolNotices(context),
  };
}
