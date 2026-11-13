import { kotlinRecipe } from '../shared/kotlin-recipe.mjs';

const GROUPS = [
  ['public', 'protected', 'private', 'internal'],
  ['expect', 'actual'],
  ['final', 'open', 'abstract', 'sealed', 'const'],
  ['external'],
  ['override'],
  ['lateinit'],
  ['tailrec'],
  ['vararg'],
  ['suspend'],
  ['inner'],
  ['enum', 'annotation', 'fun'],
  ['companion'],
  ['inline', 'value'],
  ['infix'],
  ['operator'],
  ['data'],
];
const RANK = new Map(GROUPS.flatMap((group, rank) => group.map((word) => [word, rank])));
const WORDS = [...RANK.keys()].join('|');
const RUN = new RegExp(
  [
    '(?<![\\w.@:$`])',
    `((?:(?:${WORDS})\\s+)*(?:${WORDS}))`,
    '(?=\\s+(?:class|interface|object|fun|val|var|typealias)\\b)',
  ].join(''),
  'gu',
);

function sorted(run) {
  const pieces = run.split(/(\s+)/u);
  const words = pieces.filter((_, index) => index % 2 === 0);
  const ordered = words.toSorted((left, right) => RANK.get(left) - RANK.get(right));
  return words.every((word, index) => word === ordered[index])
    ? undefined
    : pieces.map((piece, index) => (index % 2 === 0 ? ordered[index / 2] : piece)).join('');
}

export const modifierOrderRecipe = kotlinRecipe({
  id: 'kotlin-modifier-order',
  keepComments: true,
  rules: [{ tool: 'detekt', rule: 'detekt.style.ModifierOrder' }],
  where: 'both',
  find: ({ code }) =>
    [...code.matchAll(RUN)].flatMap(({ index, 1: run }) => {
      const text = sorted(run);
      return text === undefined
        ? []
        : [{ offset: index, edits: [{ start: index, end: index + run.length, text }] }];
    }),
});
