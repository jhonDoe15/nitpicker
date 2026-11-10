import { anchorOf } from './entry.mjs';

const SPRING_PAGE = 'docs/rules/java-nitpicker.md';
const PAGES = {
  java: { label: 'Java and Kotlin', path: 'docs/rules/java-pmd.md', tool: 'pmd' },
  typescript: {
    label: 'TypeScript and JavaScript',
    path: 'docs/rules/typescript-nitpicker.md',
    tool: 'eslint',
  },
  python: { label: 'Python', path: 'docs/rules/python-nitpicker.md', tool: 'python-rules' },
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
];

function spring(rule) {
  return {
    label: `Spring counterpart \`spring/${rule}\``,
    path: SPRING_PAGE,
    anchor: `spring-${rule}`,
  };
}

function link(language, rule) {
  const { label, path, tool } = PAGES[language];
  return { label: `${label} counterpart \`${rule}\``, path, anchor: anchorOf(tool, rule) };
}

function groupEntries(group) {
  const languages = Object.keys(PAGES);
  return languages.map((language) => [
    language === 'java' ? `pmd/${group.java}` : group[language],
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
