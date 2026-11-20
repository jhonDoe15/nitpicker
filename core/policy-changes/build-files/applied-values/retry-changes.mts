import { loosenedChange } from '../../../../languages/typescript/preset/project-tools/changes/applied-values.mts';
import { shownValue } from '../../../../languages/typescript/preset/project-tools/config-values.mts';
import { testRunnerConfigChanges } from '../../../../languages/typescript/preset/project-configs/test-runner/test-runner-config-changes.mts';

import type { AppliedValues, FileChange } from '../../types/policy-types.mts';

type Values = Readonly<Record<string, unknown>>;

const TEST_RUNNER_KEYS = ['retry', 'retry.delay', 'retry.condition'];
const DELAY_KEY = /delay/iu;

type Counts = { readonly base: number; readonly head: number; readonly headValues: Values };

function isDelay(key: string): boolean {
  return DELAY_KEY.test(key);
}

function anyRetries(values: Values): boolean {
  return Object.entries(values).some(([key, value]) => !isDelay(key) && Number(value) > 0);
}

function loosens(key: string, { base, head, headValues }: Counts): boolean {
  return head > base && (!isDelay(key) || anyRetries(headValues));
}

function retryKeyChanges({ base, head, file, files, fileByKey = {} }: AppliedValues): FileChange[] {
  const keys = [...new Set([...Object.keys(base), ...Object.keys(head)])].toSorted();
  return keys
    .filter((key) => (base[key] ?? 0) !== (head[key] ?? 0))
    .map((key) => {
      const [from, to] = [base[key] ?? 0, head[key] ?? 0];
      const text = `tests ${String(fileByKey[key] ?? file)} ${key}: ${shownValue(from)} -> ${shownValue(to)}`;
      return loosens(key, { base: Number(from), head: Number(to), headValues: head })
        ? loosenedChange(text, files)
        : { changed: text };
    });
}

export function testsConfigChanges(applied: AppliedValues): FileChange[] {
  const keys = Object.keys({ ...applied.base, ...applied.head });
  return keys.some((key) => TEST_RUNNER_KEYS.includes(key)) || keys.length === 0
    ? testRunnerConfigChanges(applied)
    : retryKeyChanges(applied);
}
