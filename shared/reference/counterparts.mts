import { anchorOf } from './entry.mts';
import { GROUPS } from './groups/counterpart-groups.mts';
import type {
  CounterpartEntry,
  CounterpartPage,
  DocsLink,
  Group,
  PageKey,
} from './typed/entry-types.mts';

const SPRING_PAGE = 'docs/rules/java-nitpicker.md';
const PAGES: Readonly<Record<PageKey, CounterpartPage>> = {
  java: { label: 'Java and Kotlin', path: 'docs/rules/java-pmd-nitpicker.md', tool: 'pmd' },
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

function isPageKey(key: string): key is PageKey {
  return Object.hasOwn(PAGES, key);
}
function spring(rule: string): DocsLink {
  return {
    label: `Spring counterpart \`spring/${rule}\``,
    path: SPRING_PAGE,
    anchor: `spring-${rule}`,
  };
}
function link(language: PageKey, rule: string): DocsLink {
  const { label, path, tool = '', anchor } = PAGES[language];
  return {
    label: `${label} counterpart \`${rule}\``,
    path,
    anchor: anchor ?? anchorOf(tool, rule),
  };
}
function entryName(language: PageKey, rule: string): string {
  const { tool, prefix = '' } = PAGES[language];
  return tool === 'pmd' ? `pmd/${rule}` : `${prefix}${rule}`;
}

function groupEntries(group: Group): CounterpartEntry[] {
  const present = Object.keys(PAGES)
    .filter(isPageKey)
    .flatMap((language) => {
      const rule = group[language];
      return rule === undefined ? [] : [[language, rule] as const];
    });
  return present.map(([language, rule]) => [
    entryName(language, rule),
    present
      .filter(([other]) => other !== language)
      .map(([other, otherRule]) => link(other, otherRule)),
  ]);
}

function buildCounterparts(): Map<string, DocsLink[]> {
  const merged = new Map<string, DocsLink[]>();
  for (const [rule, links] of [
    ['nitpicker/no-orm-schema-sync', [spring('ddl-auto')]],
    ['nitpicker/no-orm-query-logging', [spring('unsafe-diagnostics')]],
    ['orm-schema-sync', [spring('ddl-auto')]],
    ['orm-query-logging', [spring('unsafe-diagnostics')]],
    ...GROUPS.flatMap(groupEntries),
  ] satisfies CounterpartEntry[]) {
    merged.set(rule, [...(merged.get(rule) ?? []), ...links]);
  }
  return merged;
}

const COUNTERPARTS: ReadonlyMap<string, DocsLink[]> = buildCounterparts();

export function counterpartsOf(rule: string): DocsLink[] {
  return COUNTERPARTS.get(rule) ?? [];
}
