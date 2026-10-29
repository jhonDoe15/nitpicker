import { addedEntries, shownValue } from '../../../../core/tooling/config-value-changes.mjs';

const GROWING_LISTS = new Set([
  'mutator.excludedMutations',
  'ignorePatterns',
  'testRunnerNodeArgs',
  'checkerNodeArgs',
]);

function loosens(key, base, head) {
  if (GROWING_LISTS.has(key)) {
    return addedEntries(base, head);
  }
  return key === 'ignoreStatic' ? head === true && base !== true : key.startsWith('mutator.');
}

export function strykerConfigChanges({ base, head, files }) {
  const winners = [...new Set(files.toReversed().filter((file) => file !== undefined))];
  const keys = [...new Set([...Object.keys(base), ...Object.keys(head)])].toSorted();
  return keys
    .filter((key) => JSON.stringify(base[key]) !== JSON.stringify(head[key]))
    .map((key) => {
      const text = `stryker ${winners[0]} ${key}: ${shownValue(base[key])} -> ${shownValue(head[key])}`;
      return loosens(key, base[key], head[key])
        ? { loosened: { text, kind: 'tool-config', files: winners } }
        : { changed: text };
    });
}
