import { anchorOf } from './entry.mjs';

const SPRING_PAGE = 'docs/rules/java-nitpicker.md';
const PMD_PAGE = 'docs/rules/java-pmd.md';
const TYPESCRIPT_PAGE = 'docs/rules/typescript-nitpicker.md';
const PYTHON_PAGE = 'docs/rules/python-nitpicker.md';
const IN_MEMORY_QUERY = {
  java: 'SpringDataFilterInQuery',
  typescript: 'nitpicker/no-in-memory-query',
  python: 'in-memory-query',
};

function spring(rule) {
  return {
    label: `Spring counterpart \`spring/${rule}\``,
    path: SPRING_PAGE,
    anchor: `spring-${rule}`,
  };
}

function link(label, path, tool, rule) {
  return { label: `${label} counterpart \`${rule}\``, path, anchor: anchorOf(tool, rule) };
}

const JAVA_QUERY = link('Java and Kotlin', PMD_PAGE, 'pmd', IN_MEMORY_QUERY.java);
const TYPESCRIPT_QUERY = link(
  'TypeScript and JavaScript',
  TYPESCRIPT_PAGE,
  'eslint',
  IN_MEMORY_QUERY.typescript,
);
const PYTHON_QUERY = link('Python', PYTHON_PAGE, 'python-rules', IN_MEMORY_QUERY.python);

const COUNTERPARTS = new Map([
  ['nitpicker/no-orm-schema-sync', [spring('ddl-auto')]],
  ['nitpicker/no-orm-query-logging', [spring('unsafe-diagnostics')]],
  ['orm-schema-sync', [spring('ddl-auto')]],
  ['orm-query-logging', [spring('unsafe-diagnostics')]],
  [IN_MEMORY_QUERY.typescript, [JAVA_QUERY, PYTHON_QUERY]],
  [IN_MEMORY_QUERY.python, [JAVA_QUERY, TYPESCRIPT_QUERY]],
  [`pmd/${IN_MEMORY_QUERY.java}`, [TYPESCRIPT_QUERY, PYTHON_QUERY]],
]);

export function counterpartsOf(rule) {
  return COUNTERPARTS.get(rule) ?? [];
}
