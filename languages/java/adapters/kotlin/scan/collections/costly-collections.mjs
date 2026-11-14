import { keyedLookups } from './keyed-lookups.mjs';
import { listMemberships } from './list-membership.mjs';
import { sortedExtremes } from './sorted-extremes.mjs';
import { wastedSteps } from './wasted-steps.mjs';

const EXCEPTION = 'An exception fits only for a collection that always stays a handful of items.';

const COSTLY_COLLECTION_MESSAGES = {
  ListUsedAsSet: `This list gets \`add\` and is searched with \`contains\` or \`in\` inside a loop or an iterating lambda, so every search scans the whole list. Keep it in a set (\`mutableSetOf()\`, which keeps insertion order): \`add\` returns false when the item is already there. ${EXCEPTION}`,
  LinearLookupInLoop: `This keyed lookup (\`find\`, \`first\`, \`any\`, \`indexOfFirst\` and the like) scans the whole collection for one key on every pass of the enclosing loop or iterating lambda, and the collection does not change in between. Build a map once before the loop (\`associateBy { it.key }\`) and use \`get\` (\`in\` on a set of keys for \`any\`). ${EXCEPTION}`,
  RedundantStreamStep:
    'This step builds a list only to read it once: `map { }.flatten()` is `flatMap { }`, and `toList()` or `toMutableList()` followed by `size`, `count()`, `isEmpty()`, `isNotEmpty()` or `contains` copies every item to ask the original. Use `flatMap`, or ask the collection or sequence itself (`count()` on a sequence).',
  SortForExtreme: `The collection is sorted only to take its first or last element, which costs a full sort. Take it in one pass: \`min\`, \`max\`, \`minBy\`, \`maxBy\`, \`minOf\`, \`maxOf\`, \`minWith\` or their \`OrNull\` forms. ${EXCEPTION}`,
};

export const kotlinSourceRules = {
  messages: COSTLY_COLLECTION_MESSAGES,
  main: [listMemberships, keyedLookups, sortedExtremes, wastedSteps],
};
