export function beyondReplacedOffsets(removedCount: number, count: number): number[] {
  return Array.from(
    { length: Math.max(count - removedCount, 0) },
    (_, index) => removedCount + index,
  );
}

const EDITED_LINE_SIMILARITY = 0.5;

export function unpairedOffsets(removed: readonly string[], added: readonly string[]): number[] {
  const removedWords = removed.map(wordsOf);
  const addedWords = added.map(wordsOf);
  const candidates = addedWords
    .flatMap((words, addedIndex) =>
      removedWords.map((before, removedIndex) => ({
        addedIndex,
        removedIndex,
        score: similarity(before, words),
      })),
    )
    .filter(({ score }) => score >= EDITED_LINE_SIMILARITY)
    .toSorted((left, right) => right.score - left.score);
  const pairedAdded = new Set<number>();
  const pairedRemoved = new Set<number>();
  for (const { addedIndex, removedIndex } of candidates) {
    if (!(pairedAdded.has(addedIndex) || pairedRemoved.has(removedIndex))) {
      pairedAdded.add(addedIndex);
      pairedRemoved.add(removedIndex);
    }
  }
  return added.flatMap((_, index) => (pairedAdded.has(index) ? [] : [index]));
}

function wordsOf(line: string): string[] {
  return line.match(/[\p{L}\p{N}_$]+/gu) ?? [];
}

function wordCounts(words: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const word of words) {
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  return counts;
}

function similarity(before: readonly string[], after: readonly string[]): number {
  const total = before.length + after.length;
  if (total === 0) {
    return 1;
  }
  const beforeCounts = wordCounts(before);
  const shared = [...wordCounts(after)].reduce(
    (sum, [word, count]) => sum + Math.min(count, beforeCounts.get(word) ?? 0),
    0,
  );
  return (2 * shared) / total;
}
