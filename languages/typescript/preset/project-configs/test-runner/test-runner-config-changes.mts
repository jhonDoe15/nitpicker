import type { FileChange } from '../../../../../core/policy-changes/types/policy-types.mts';
import { loosenedChange } from '../../project-tools/changes/applied-values.mts';
import { shownValue } from '../../project-tools/config-values.mts';
import { numberOr } from '../../../../../shared/values/readers.mts';
import type { AppliedChange, ToolValues } from '../../project-tools/typed/tool-types.mts';

const RETRY = 'retry';
const KEYS = [RETRY, 'retry.delay', 'retry.condition'];
const DEFAULTS: ToolValues = { retry: 0, 'retry.delay': 0 };

function valueOf(values: ToolValues, key: string): unknown {
  return values[key] ?? DEFAULTS[key];
}

function loosens(
  key: string,
  { base, head, count }: { base: unknown; head: unknown; count: number },
): boolean {
  if (key === RETRY) {
    return numberOr(head, 0) > numberOr(base, 0);
  }
  if (key === 'retry.delay') {
    return numberOr(head, 0) > numberOr(base, 0) && count > 0;
  }
  return count > 0 && base !== undefined && head !== base;
}

export function testRunnerConfigChanges({ base, head, file, files }: AppliedChange): FileChange[] {
  const headCount = numberOr(valueOf(head, RETRY), 0);
  return KEYS.filter((key) => valueOf(base, key) !== valueOf(head, key)).map((key) => {
    const [from, to] = [valueOf(base, key), valueOf(head, key)];
    const text = `tests ${String(file)} ${key}: ${shownValue(from)} -> ${shownValue(to)}`;
    return loosens(key, { base: from, head: to, count: headCount })
      ? loosenedChange(text, files)
      : { changed: text };
  });
}
