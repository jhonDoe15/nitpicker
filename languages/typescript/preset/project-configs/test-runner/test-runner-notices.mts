import { fieldOf, messageOf, numberOr, textOf } from '../../../../../shared/values/readers.mts';
import { ignoredConfigNotice, precedenceLayers } from '../../project-tools/typed/shared-views.mts';
import type { ToolPolicy } from '../../project-tools/typed/tool-types.mts';
import type { RetryRead } from '../project-config-types.mts';
import { TESTS_TOOL, readRunnerRetry } from './test-runner-config.mts';
import { retryValues } from './test-retry.mts';

const RETRY_SETTINGS: Readonly<Record<string, string>> = { vitest: 'test.retry', mocha: 'retries' };

function retries(retry: unknown): number {
  return numberOr(fieldOf(retryValues(retry), 'retry'), 0);
}

function ignoredProjectNotice(name: string, file: string): string {
  return (
    `Ignoring test.retry of the Vitest project "${name}" in ${file}; ` +
    'with the opt-in only test.retry of the root config applies, to every project'
  );
}

type Readable = { failure: string } | (({ runner: string } & RetryRead) & { failure?: undefined });

function readable(projectRoot: string, runner: string | undefined): Readable {
  try {
    return readRunnerRetry(projectRoot, { configuredRunner: runner });
  } catch (error) {
    return { failure: messageOf(error) };
  }
}

export function testsIgnoredNotices({
  config,
  projectRoot,
}: {
  readonly config: ToolPolicy;
  readonly projectRoot: string;
}): string[] {
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
      : [
          ignoredConfigNotice(
            `${String(RETRY_SETTINGS[found.runner])} in ${found.file}`,
            TESTS_TOOL,
          ),
        ]),
    ...(found.ignored ?? [])
      .filter((entry) => retries(fieldOf(entry, 'retry')) > 0)
      .map((entry) => ignoredProjectNotice(textOf(fieldOf(entry, 'name')), found.file)),
  ];
}
