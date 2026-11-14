import { stringValue } from '../../analysis/constant-resolution.mjs';
import { childrenOf } from '../../loops/loop-shapes.mjs';
import { firstString } from '../../support/orm/chains.mjs';
import { ormSite } from '../../support/orm/sites.mjs';
import { tableKey } from '../../support/orm/table-names.mjs';
import {
  COLUMN_IN_TEXT,
  columnKey,
  isAcknowledgement,
  isColumn,
  isHelperName,
} from './columns.mjs';

const JOINS = new Set(['join', 'innerJoin', 'leftJoin', 'rightJoin', 'fullJoin', 'leftOuterJoin']);
const RELATION_KEYS = new Set([
  'include',
  'select',
  'relations',
  'join',
  'with',
  'populate',
  'orderBy',
]);

function aliasOf(text) {
  const match = /^\s*[\w.]+\s+(?:as\s+)?(\w+)\s*$/iu.exec(text ?? '');
  return match?.[1];
}

function joinedTable(step) {
  const [first, second] = step.args ?? [];
  const text = firstString(step.args);
  if (text !== undefined) {
    const dotted = text.split(/\s+/u)[0].includes('.');
    return dotted
      ? undefined
      : { table: tableKey(text), alias: aliasOf(text) ?? stringValue(second) };
  }
  const named = first?.type === 'Identifier' ? first.name : undefined;
  return named === undefined ? undefined : { table: tableKey(named), alias: named };
}

function builderAlias(steps) {
  const [first, second] = steps.find((step) => step.name === 'createQueryBuilder')?.args ?? [];
  return stringValue(first) ?? stringValue(second);
}

function tablesOf(site) {
  const { steps } = site.chain;
  const alias = builderAlias(steps) ?? aliasOf(firstString(steps.find((step) => step.args)?.args));
  const joined = steps.filter((step) => JOINS.has(step.name)).map(joinedTable);
  return [{ table: site.table, alias }, ...joined.filter(Boolean)].map((each) => ({
    ...each,
    columns: new Map(),
    helpers: new Set(),
  }));
}

function nameOf(node) {
  if (node.type === 'Identifier') {
    return node.name;
  }
  if (node.type === 'MemberExpression' && !node.computed) {
    return node.property.name;
  }
  return node.type === 'Literal' && typeof node.value === 'string' ? node.value : undefined;
}

function isLoneColumnArgument(node, text) {
  const isFirstArgument =
    node.parent?.type === 'CallExpression' && node.parent.arguments[0] === node;
  return isFirstArgument && isColumn(text.trim());
}

function textMentions(node) {
  const text =
    stringValue(node) ??
    (node.type === 'TemplateLiteral' ? node.quasis.map((q) => q.value.raw).join('?') : undefined);
  if (text === undefined) {
    return [];
  }
  if (isLoneColumnArgument(node, text)) {
    return [{ prefix: undefined, column: text.trim() }];
  }
  return [...text.matchAll(COLUMN_IN_TEXT)]
    .filter((match) => match[1] !== undefined || match[3] !== undefined)
    .map((match) => ({ prefix: match[1], column: match[2] }));
}

function columnMentions(node) {
  if (node.type === 'Property' && isColumn(nameOf(node.key))) {
    return [{ prefix: undefined, column: nameOf(node.key) }];
  }
  if (node.type === 'MemberExpression' && !node.computed && isColumn(node.property.name)) {
    return [{ prefix: nameOf(node.object), column: node.property.name }];
  }
  return [];
}

function helperNames(node) {
  if (node.type !== 'CallExpression') {
    return [];
  }
  return [node.callee, ...node.arguments]
    .filter((callee) => callee.type !== 'Literal' && isHelperName(nameOf(callee)))
    .map(nameOf);
}

function acknowledges(node) {
  if (node.type === 'Identifier') {
    return isAcknowledgement(node.name);
  }
  return node.type === 'Property' && isAcknowledgement(nameOf(node.key));
}

function collect(root, visitorKeys) {
  const found = { mentions: [], helpers: new Set(), acknowledged: false };
  const pending = [root];
  for (const node of pending) {
    found.mentions.push(...textMentions(node));
    if (node.type === 'Property' && RELATION_KEYS.has(nameOf(node.key))) {
      continue;
    }
    found.mentions.push(...columnMentions(node));
    for (const name of helperNames(node)) {
      found.helpers.add(name);
    }
    found.acknowledged ||= acknowledges(node);
    pending.push(...childrenOf(node, visitorKeys));
  }
  return found;
}

export function readMentions(call, orms, visitorKeys) {
  const site = ormSite(call, 'read', orms);
  if (site === undefined || site.table === undefined) {
    return undefined;
  }
  const tables = tablesOf(site);
  const { mentions, helpers, acknowledged } = collect(call, visitorKeys);
  for (const { prefix, column } of mentions) {
    const keyed = prefix === undefined ? undefined : tableKey(prefix);
    const owner =
      prefix === undefined
        ? tables[0]
        : tables.find((each) => each.alias === prefix || each.table === keyed);
    owner?.columns.set(columnKey(column), column);
  }
  tables[0].helpers = helpers;
  return { tables, acknowledged };
}
