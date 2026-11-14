import { tableKey } from '../../../preset/eslint-plugin/rules/support/orm/table-names.mjs';

const LOOKBEHIND = 200;
const CLASS_START = /\bclass\s+(\w+)/gu;
const ENTITY_NAME = /@Entity\(\s*['"`]([\w.]+)['"`]/u;
const SOFT_DELETE_DECORATOR = /@DeleteDateColumn\b/u;
const PARANOID = /\bparanoid\s*:\s*true\b/u;
const DEFINED = /\bdefine\(\s*['"`](\w+)['"`][^]{0,600}?\bparanoid\s*:\s*true\b/gu;
const PRISMA_EXTENSION = /\$extends\s*\([^]*?\bdeletedAt\b/u;

function classSegments(text) {
  const starts = [...text.matchAll(CLASS_START)];
  return starts.map((match, index) => ({
    name: match[1],
    body: text.slice(match.index, starts[index + 1]?.index ?? text.length),
    before: text.slice(Math.max(0, match.index - LOOKBEHIND), match.index),
  }));
}

function automaticClasses(text) {
  return classSegments(text)
    .filter(({ body }) => SOFT_DELETE_DECORATOR.test(body) || PARANOID.test(body))
    .flatMap(({ name, before }) => [name, ENTITY_NAME.exec(before)?.[1]]);
}

export function automaticTables(text) {
  if (PRISMA_EXTENSION.test(text)) {
    return ['auto:all#1'];
  }
  const defined = [...text.matchAll(DEFINED)].map((match) => match[1]);
  const tables = [...automaticClasses(text), ...defined].map(tableKey);
  return [...new Set(tables.filter(Boolean))].map((table) => `auto:${table}#1`);
}
