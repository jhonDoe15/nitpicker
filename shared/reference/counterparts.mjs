import { anchorOf } from './entry.mjs';

const SPRING_PAGE = 'docs/rules/java-nitpicker.md';
const PAGES = {
  java: { label: 'Java and Kotlin', path: 'docs/rules/java-pmd.md', tool: 'pmd' },
  jvm: { label: 'Java and Kotlin', path: SPRING_PAGE, tool: 'pmd' },
  typescript: {
    label: 'TypeScript and JavaScript',
    path: 'docs/rules/typescript-nitpicker.md',
    tool: 'eslint',
  },
  spring: { label: 'Spring', path: SPRING_PAGE, tool: 'spring', prefix: 'spring/' },
  python: { label: 'Python', path: 'docs/rules/python-nitpicker.md', tool: 'python-rules' },
  go: { label: 'Go', path: 'docs/go-preset.md', anchor: 'own-rules' },
};
const GROUPS = [
  {
    java: 'SurrogateSplittingCut',
    typescript: 'nitpicker/no-surrogate-splitting-cut',
    go: 'go-rules/byte-cut-splits-rune',
  },
  {
    java: 'NewlineOnlyLineSplit',
    typescript: 'nitpicker/no-newline-only-line-split',
    go: 'go-rules/newline-only-line-split',
  },
  {
    java: 'HostPortColonSplit',
    typescript: 'nitpicker/no-host-port-colon-split',
    python: 'host-port-colon-split',
    go: 'go-rules/host-port-colon-split',
  },
  {
    java: 'DelimitedLookupKey',
    typescript: 'nitpicker/no-ambiguous-lookup-key',
    python: 'delimited-lookup-key',
    go: 'go-rules/delimited-lookup-key',
  },
  {
    java: 'PairSplitDropsRest',
    typescript: 'nitpicker/no-truncating-pair-split',
    python: 'pair-split-drops-rest',
    go: 'go-rules/pair-split-drops-rest',
  },
  {
    java: 'SpringDataFilterInQuery',
    typescript: 'nitpicker/no-in-memory-query',
    python: 'in-memory-query',
  },
  {
    java: 'JpaMultipleCollectionFetch',
    typescript: 'nitpicker/no-multiple-collection-joins',
    python: 'multiple-collection-joins',
  },
  {
    java: 'JpaUnindexedForeignKey',
    typescript: 'nitpicker/no-unindexed-foreign-key',
    python: 'unindexed-foreign-key',
    go: 'go-rules/unindexed-foreign-key',
  },
  {
    java: 'HttpValueCase',
    typescript: 'nitpicker/no-raw-http-value',
    python: 'http-value-case',
    go: 'go-rules/http-value-case',
  },
  {
    java: 'HandSplitHttpHeader',
    typescript: 'nitpicker/no-raw-http-value',
    python: 'hand-split-http-header',
    go: 'go-rules/hand-split-http-header',
  },
  {
    jvm: 'CopiedConstantInTest',
    typescript: 'nitpicker/no-copied-constant',
    python: 'copied-constant-in-test',
    go: 'go-rules/copied-constant-in-test',
  },
  {
    spring: 'untrimmed-request-text',
    typescript: 'nitpicker/no-untrimmed-request-text',
    python: 'untrimmed-request-text',
    go: 'go-rules/untrimmed-request-text',
  },
  {
    typescript: 'nitpicker/no-presence-truthiness',
    python: 'presence-truthiness',
  },
  {
    jvm: 'MaxValueOverflow',
    go: 'go-rules/max-value-overflow',
  },
  {
    jvm: 'PatternTranslation',
    typescript: 'nitpicker/no-unescaped-pattern-translation',
    python: 'pattern-translation',
    go: 'go-rules/pattern-translation',
  },
  {
    jvm: 'ExpandingReplacement',
    typescript: 'nitpicker/no-expanding-replacement-string',
    python: 'expanding-replacement',
    go: 'go-rules/expanding-replacement',
  },
  {
    jvm: 'UnescapedHtmlValue',
    typescript: 'nitpicker/no-unescaped-html-interpolation',
    python: 'unescaped-html-value',
    go: 'go-rules/unescaped-html-value',
  },
  {
    jvm: 'UncheckedResponseBody',
    typescript: 'nitpicker/no-unchecked-response-json',
    python: 'unchecked-response-json',
    go: 'go-rules/unchecked-response-json',
  },
  {
    jvm: 'NanOnlyGuard',
    typescript: 'nitpicker/no-nan-only-check',
    python: 'nan-only-guard',
    go: 'go-rules/nan-only-guard',
  },
  {
    jvm: 'NegativeCountArgument',
    typescript: 'nitpicker/no-negative-count',
    go: 'go-rules/negative-count',
  },
  {
    jvm: 'IndexBoundOffByOne',
    typescript: 'nitpicker/no-index-bound-off-by-one',
    python: 'index-bound-off-by-one',
    go: 'go-rules/index-bound-off-by-one',
  },
  {
    jvm: 'BackoffShiftOverflow',
    typescript: 'nitpicker/no-overflowing-backoff',
    go: 'go-rules/backoff-shift-overflow',
  },
  {
    jvm: 'WallClockElapsed',
    typescript: 'nitpicker/no-wall-clock-elapsed',
    python: 'wall-clock-elapsed',
    go: 'go-rules/wall-clock-elapsed',
  },
  {
    jvm: 'AffixWithoutBoundary',
    typescript: 'nitpicker/no-prefix-without-boundary',
    python: 'prefix-without-boundary',
    go: 'go-rules/prefix-without-boundary',
  },
  {
    jvm: 'AffixRemovedByReplace',
    typescript: 'nitpicker/no-unanchored-affix-replace',
    python: 'unanchored-affix-replace',
    go: 'go-rules/unanchored-affix-replace',
  },
  {
    jvm: 'CaseMismatchedLookup',
    typescript: 'nitpicker/no-case-mismatched-lookup',
    python: 'case-mismatched-lookup',
    go: 'go-rules/case-mismatched-lookup',
  },
  {
    jvm: 'PreconditionMessageNamesOtherValue',
    typescript: 'nitpicker/no-mismatched-precondition-message',
    python: 'precondition-message-names-other-value',
    go: 'go-rules/precondition-message-names-other-value',
  },
  {
    jvm: 'MalformedQueryText',
    typescript: 'nitpicker/no-malformed-query-text',
    python: 'malformed-query-text',
    go: 'go-rules/malformed-query-text',
  },
  {
    jvm: 'UnpagedListing',
    typescript: 'nitpicker/no-unpaged-listing',
    python: 'unpaged-listing',
    go: 'go-rules/unpaged-listing',
    jvm: 'NullBranchFallThrough',
    typescript: 'nitpicker/no-null-branch-fall-through',
    python: 'null-branch-fall-through',
    go: 'go-rules/nil-branch-fall-through',
  },
];

function spring(rule) {
  return {
    label: `Spring counterpart \`spring/${rule}\``,
    path: SPRING_PAGE,
    anchor: `spring-${rule}`,
  };
}

function link(language, rule) {
  const { label, path, tool, anchor } = PAGES[language];
  return {
    label: `${label} counterpart \`${rule}\``,
    path,
    anchor: anchor ?? anchorOf(tool, rule),
  };
}

function entryName(language, rule) {
  const { tool, prefix = '' } = PAGES[language];
  return tool === 'pmd' ? `pmd/${rule}` : `${prefix}${rule}`;
}

function groupEntries(group) {
  const languages = Object.keys(PAGES).filter((language) => group[language] !== undefined);
  return languages.map((language) => [
    entryName(language, group[language]),
    languages.filter((other) => other !== language).map((other) => link(other, group[other])),
  ]);
}

function mergedEntries(entries) {
  const merged = new Map();
  for (const [rule, links] of entries) {
    merged.set(rule, [...(merged.get(rule) ?? []), ...links]);
  }
  return merged;
}

const COUNTERPARTS = mergedEntries([
  ['nitpicker/no-orm-schema-sync', [spring('ddl-auto')]],
  ['nitpicker/no-orm-query-logging', [spring('unsafe-diagnostics')]],
  ['orm-schema-sync', [spring('ddl-auto')]],
  ['orm-query-logging', [spring('unsafe-diagnostics')]],
  ...GROUPS.flatMap(groupEntries),
]);

export function counterpartsOf(rule) {
  return COUNTERPARTS.get(rule) ?? [];
}
