import { shownValue } from '../../../../../core/tooling/config-value-changes.mjs';

const KEYS = ['retry', 'retry.delay', 'retry.condition'];
const DEFAULTS = { retry: 0, 'retry.delay': 0 };

function valueOf(values, key) {
  return values[key] ?? DEFAULTS[key];
}

function loosens(key, { base, head, count }) {
  if (key === 'retry') {
    return head > base;
  }
  if (key === 'retry.delay') {
    return head > base && count > 0;
  }
  return count > 0 && base !== undefined && head !== base;
}

export function testRunnerConfigChanges({ base, head, file, files }) {
  const headCount = valueOf(head, 'retry');
  return KEYS.filter((key) => valueOf(base, key) !== valueOf(head, key)).map((key) => {
    const [from, to] = [valueOf(base, key), valueOf(head, key)];
    const text = `tests ${file} ${key}: ${shownValue(from)} -> ${shownValue(to)}`;
    return loosens(key, { base: from, head: to, count: headCount })
      ? { loosened: { text, kind: 'tool-config', files } }
      : { changed: text };
  });
}
