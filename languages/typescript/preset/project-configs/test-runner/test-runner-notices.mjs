import {
  ignoredConfigNotice,
  precedenceLayers,
} from '../../../../../shared/conventions/tool-precedence.mjs';
import { TESTS_TOOL, readRunnerRetry } from './test-runner-config.mjs';
import { retryValues } from './test-retry.mjs';

const RETRY_SETTINGS = { vitest: 'test.retry', mocha: 'retries' };

function retries(retry) {
  return retryValues(retry).retry;
}

function ignoredProjectNotice(name, file) {
  return (
    `Ignoring test.retry of the Vitest project "${name}" in ${file}; ` +
    'with the opt-in only test.retry of the root config applies, to every project'
  );
}

function readable(projectRoot, runner) {
  try {
    return readRunnerRetry(projectRoot, { configuredRunner: runner });
  } catch (error) {
    return { failure: error.message };
  }
}

export function testsIgnoredNotices({ config, projectRoot }) {
  const settings = config.tools?.[TESTS_TOOL];
  const layers = precedenceLayers(settings?.precedence);
  if ((config.disable ?? []).includes('coverage') || layers.nitpickerFirst) {
    return [];
  }
  const found = readable(projectRoot, settings?.runner);
  if (found.failure !== undefined) {
    return [];
  }
  return [
    ...(layers.usesProject || retries(found.retry) === 0
      ? []
      : [ignoredConfigNotice(`${RETRY_SETTINGS[found.runner]} in ${found.file}`, TESTS_TOOL)]),
    ...(found.ignored ?? [])
      .filter(({ retry }) => retries(retry) > 0)
      .map(({ name }) => ignoredProjectNotice(name, found.file)),
  ];
}
