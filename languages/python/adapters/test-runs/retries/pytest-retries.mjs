import {
  ignoredConfigNotice,
  missingProjectConfig,
  precedenceLayers,
} from '../../../../../shared/conventions/tool-precedence.mjs';
import { toolLayers } from '../../project-tools/project-tool-layers.mjs';
import { readPytestOptions, shellWords } from '../pytest-pins.mjs';

const TESTS_TOOL = 'tests';
export const CONFIG_RETRIES_ENVIRONMENT = 'NITPICKER_CONFIG_RETRIES';

const MAX_COUNT = 10;
const MAX_DELAY_SECONDS = 60;
const COUNT_KEYS = ['reruns', 'retries'];
const DELAY_KEYS = ['reruns_delay', 'retry_delay'];
const ADDOPTS_FLAGS = new Map([
  ['--reruns', 'reruns'],
  ['--reruns-delay', 'reruns_delay'],
  ['--retries', 'retries'],
  ['--retry-delay', 'retry_delay'],
]);
const LOOKED =
  'reruns, reruns_delay, retries or retry_delay in a pytest config ' +
  '(pytest.ini, pyproject.toml, tox.ini or setup.cfg), ' +
  'or --reruns, --reruns-delay, --retries or --retry-delay in its addopts';

function checked(key, raw, file) {
  const value = typeof raw === 'number' ? raw : Number(String(raw).trim());
  const count = COUNT_KEYS.includes(key);
  const limit = count ? MAX_COUNT : MAX_DELAY_SECONDS;
  const valid =
    Number.isFinite(value) && value >= 0 && value <= limit && (!count || Number.isInteger(value));
  if (!valid) {
    const expected = count
      ? `a whole number from 0 to ${String(MAX_COUNT)}`
      : `a number of seconds from 0 to ${String(MAX_DELAY_SECONDS)}`;
    throw new Error(`${key} in ${file} is ${JSON.stringify(raw)}: it must be ${expected}`);
  }
  return value;
}

function fromAddopts(options) {
  const raw = options.addopts ?? [];
  const words = Array.isArray(raw) ? raw.map(String) : shellWords(String(raw));
  return words.flatMap((word, index) => {
    const [name, attached] = word.split('=');
    const key = ADDOPTS_FLAGS.get(name);
    const value = attached ?? words[index + 1];
    return key === undefined || value === undefined ? [] : [[key, value]];
  });
}

export function readPytestRetries(projectRoot) {
  const { file, options } = readPytestOptions(projectRoot);
  const found = [
    ...[...COUNT_KEYS, ...DELAY_KEYS]
      .filter((key) => options[key] !== undefined)
      .map((key) => [key, options[key]]),
    ...fromAddopts(options),
  ];
  return {
    file,
    values: Object.fromEntries(found.map(([key, raw]) => [key, checked(key, raw, file)])),
  };
}

export function projectRetries(context) {
  const layers = toolLayers(context, TESTS_TOOL);
  if (!layers.appliesProject) {
    return undefined;
  }
  const { values } = readPytestRetries(layers.configRoot);
  if (Object.keys(values).length === 0) {
    throw new Error(missingProjectConfig(TESTS_TOOL, `${LOOKED} (searched ${layers.configRoot})`));
  }
  return values;
}

export function retriesNotices({ config, projectRoot }) {
  const layers = precedenceLayers(config.tools?.[TESTS_TOOL]?.precedence);
  if (layers.usesProject || layers.nitpickerFirst) {
    return [];
  }
  const { file, values } = readPytestRetries(projectRoot);
  const key = COUNT_KEYS.find((candidate) => values[candidate] > 0);
  return key === undefined ? [] : [ignoredConfigNotice(`${key} in ${file}`, TESTS_TOOL)];
}
