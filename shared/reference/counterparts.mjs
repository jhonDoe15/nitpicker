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
  python: { label: 'Python', path: 'docs/rules/python-nitpicker.md', tool: 'python-rules' },
  go: { label: 'Go', path: 'docs/go-preset.md', anchor: 'own-rules' },
};
const GROUPS = [
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
    jvm: 'CopiedConstantInTest',
    typescript: 'nitpicker/no-copied-constant',
    python: 'copied-constant-in-test',
    go: 'go-rules/copied-constant-in-test',
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

function groupEntries(group) {
  const languages = Object.keys(PAGES).filter((language) => group[language] !== undefined);
  return languages.map((language) => [
    PAGES[language].tool === 'pmd' ? `pmd/${group[language]}` : group[language],
    languages.filter((other) => other !== language).map((other) => link(other, group[other])),
  ]);
}

const COUNTERPARTS = new Map([
  ['nitpicker/no-orm-schema-sync', [spring('ddl-auto')]],
  ['nitpicker/no-orm-query-logging', [spring('unsafe-diagnostics')]],
  ['orm-schema-sync', [spring('ddl-auto')]],
  ['orm-query-logging', [spring('unsafe-diagnostics')]],
  ...GROUPS.flatMap(groupEntries),
]);

export function counterpartsOf(rule) {
  return COUNTERPARTS.get(rule) ?? [];
}
