const SPRING_PAGE = 'docs/rules/java-nitpicker.md';

function spring(rule) {
  return {
    label: `Spring counterpart \`spring/${rule}\``,
    path: SPRING_PAGE,
    anchor: `spring${rule}`,
  };
}

const COUNTERPARTS = new Map([
  ['nitpicker/no-orm-schema-sync', [spring('ddl-auto')]],
  ['nitpicker/no-orm-query-logging', [spring('unsafe-diagnostics')]],
  ['orm-schema-sync', [spring('ddl-auto')]],
  ['orm-query-logging', [spring('unsafe-diagnostics')]],
]);

export function counterpartsOf(rule) {
  return COUNTERPARTS.get(rule) ?? [];
}
