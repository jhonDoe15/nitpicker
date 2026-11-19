import type { FileChange } from '../../../../core/policy-changes/types/policy-types.mts';
import { addsEntries, loosenedChange } from '../project-tools/changes/applied-values.mts';
import type { AppliedChange } from '../project-tools/typed/tool-types.mts';
import { shownValue } from '../project-tools/config-values.mts';

const GROWING_LISTS = new Set([
  'mutator.excludedMutations',
  'ignorePatterns',
  'testRunnerNodeArgs',
  'checkerNodeArgs',
]);

function loosens(key: string, base: unknown, head: unknown): boolean {
  if (GROWING_LISTS.has(key)) {
    return addsEntries(base, head);
  }
  return key === 'ignoreStatic' ? head === true && base !== true : key.startsWith('mutator.');
}

export function strykerConfigChanges({ base, head, files }: AppliedChange): FileChange[] {
  const winners = [...new Set((files ?? []).toReversed())];
  const keys = [...new Set([...Object.keys(base), ...Object.keys(head)])].toSorted();
  return keys
    .filter((key) => JSON.stringify(base[key]) !== JSON.stringify(head[key]))
    .map((key) => {
      const text = `stryker ${String(winners[0])} ${key}: ${shownValue(base[key])} -> ${shownValue(head[key])}`;
      return loosens(key, base[key], head[key]) ? loosenedChange(text, winners) : { changed: text };
    });
}
