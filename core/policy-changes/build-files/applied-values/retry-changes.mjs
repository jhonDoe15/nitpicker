import { shownValue } from '../../../../languages/typescript/preset/project-tools/config-values.mjs';
import { testRunnerConfigChanges } from '../../../../languages/typescript/preset/project-configs/test-runner/test-runner-config-changes.mjs';

const TEST_RUNNER_KEYS = ['retry', 'retry.delay', 'retry.condition'];
const DELAY_KEY = /delay/iu;

function isDelay(key) {
  return DELAY_KEY.test(key);
}

function anyRetries(values) {
  return Object.entries(values).some(([key, value]) => !isDelay(key) && value > 0);
}

function loosens(key, { base, head, headValues }) {
  return head > base && (!isDelay(key) || anyRetries(headValues));
}

function retryKeyChanges({ base, head, file, files, fileByKey = {} }) {
  const keys = [...new Set([...Object.keys(base), ...Object.keys(head)])].toSorted();
  return keys
    .filter((key) => (base[key] ?? 0) !== (head[key] ?? 0))
    .map((key) => {
      const [from, to] = [base[key] ?? 0, head[key] ?? 0];
      const text = `tests ${fileByKey[key] ?? file} ${key}: ${shownValue(from)} -> ${shownValue(to)}`;
      return loosens(key, { base: from, head: to, headValues: head })
        ? { loosened: { text, kind: 'tool-config', files } }
        : { changed: text };
    });
}

export function testsConfigChanges(applied) {
  const keys = Object.keys({ ...applied.base, ...applied.head });
  return keys.some((key) => TEST_RUNNER_KEYS.includes(key)) || keys.length === 0
    ? testRunnerConfigChanges(applied)
    : retryKeyChanges(applied);
}
