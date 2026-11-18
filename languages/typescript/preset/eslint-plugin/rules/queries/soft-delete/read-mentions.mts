import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { stringValue } from '../../analysis/constant-resolution.mts';
import { childrenOf } from '../../loops/loop-shapes.mts';
import { firstString, type ChainStep } from '../../support/orm/chains.mts';
import { ormSite, type FoundSite } from '../../support/orm/sites.mts';
import { tableKey } from '../../support/orm/table-names.mts';
import type { VisitorKeys } from '../../typed/node-views.mts';
import {
  COLUMN_IN_TEXT,
  columnKey,
  isAcknowledgement,
  isColumn,
  isHelperName,
} from './columns.mts';
import { appendAll } from '../../../../../../../shared/lists/lists.mts';

type Mention = { readonly prefix: string | undefined; readonly column: string };
type Joined = { readonly table: string | undefined; readonly alias: string | undefined };
export type TableEntry = Joined & { columns: Map<string, string>; helpers: Set<string> };
export type Mentions = { readonly tables: TableEntry[]; readonly acknowledged: boolean };

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

function aliasOf(text: string | undefined): string | undefined {
  const match = /^\s*[\w.]+\s+(?:as\s+)?(\w+)\s*$/iu.exec(text ?? '');
  return match?.[1];
}

function joinedTable(step: ChainStep): Joined | undefined {
  const [first, second] = step.args ?? [];
  const text = firstString(step.args);
  if (text !== undefined) {
    const dotted = (text.split(/\s+/u)[0] ?? '').includes('.');
    return dotted
      ? undefined
      : { table: tableKey(text), alias: aliasOf(text) ?? stringValue(second) };
  }
  const named = first?.type === AST_NODE_TYPES.Identifier ? first.name : undefined;
  return named === undefined ? undefined : { table: tableKey(named), alias: named };
}

function builderAlias(steps: readonly ChainStep[]): string | undefined {
  const [first, second] = steps.find((step) => step.name === 'createQueryBuilder')?.args ?? [];
  return stringValue(first) ?? stringValue(second);
}

function tablesOf(site: FoundSite): TableEntry[] {
  const { steps } = site.chain;
  const alias = builderAlias(steps) ?? aliasOf(firstString(steps.find((step) => step.args)?.args));
  const joined = steps
    .filter((step) => JOINS.has(step.name ?? ''))
    .map(joinedTable)
    .filter((each): each is Joined => each !== undefined);
  return [{ table: site.table, alias }, ...joined].map((each) => ({
    ...each,
    columns: new Map(),
    helpers: new Set(),
  }));
}

function nameOf(node: TSESTree.Node): string | undefined {
  if (node.type === AST_NODE_TYPES.Identifier) {
    return node.name;
  }
  if (node.type === AST_NODE_TYPES.MemberExpression && !node.computed) {
    return node.property.name;
  }
  return node.type === AST_NODE_TYPES.Literal && typeof node.value === 'string'
    ? node.value
    : undefined;
}

function isLoneColumnArgument(node: TSESTree.Node, text: string): boolean {
  const isFirstArgument =
    node.parent?.type === AST_NODE_TYPES.CallExpression && node.parent.arguments[0] === node;
  return isFirstArgument && isColumn(text.trim());
}

function textMentions(node: TSESTree.Node): Mention[] {
  const text =
    stringValue(node) ??
    (node.type === AST_NODE_TYPES.TemplateLiteral
      ? node.quasis.map((q) => q.value.raw).join('?')
      : undefined);
  if (text === undefined) {
    return [];
  }
  if (isLoneColumnArgument(node, text)) {
    return [{ prefix: undefined, column: text.trim() }];
  }
  return [...text.matchAll(COLUMN_IN_TEXT)]
    .filter((match) => match[1] !== undefined || match[3] !== undefined)
    .flatMap((match) => (match[2] === undefined ? [] : [{ prefix: match[1], column: match[2] }]));
}

function columnMentions(node: TSESTree.Node): Mention[] {
  if (node.type === AST_NODE_TYPES.Property) {
    const column = nameOf(node.key);
    return column !== undefined && isColumn(column) ? [{ prefix: undefined, column }] : [];
  }
  if (node.type === AST_NODE_TYPES.MemberExpression && !node.computed) {
    const { name } = node.property;
    return isColumn(name) ? [{ prefix: nameOf(node.object), column: name }] : [];
  }
  return [];
}

function helperNames(node: TSESTree.Node): string[] {
  if (node.type !== AST_NODE_TYPES.CallExpression) {
    return [];
  }
  return [node.callee, ...node.arguments].flatMap((callee) => {
    const name = callee.type === AST_NODE_TYPES.Literal ? undefined : nameOf(callee);
    return name !== undefined && isHelperName(name) ? [name] : [];
  });
}

function acknowledges(node: TSESTree.Node): boolean {
  if (node.type === AST_NODE_TYPES.Identifier) {
    return isAcknowledgement(node.name);
  }
  return node.type === AST_NODE_TYPES.Property && isAcknowledgement(nameOf(node.key));
}

function isRelationKey(node: TSESTree.Node): boolean {
  if (node.type !== AST_NODE_TYPES.Property) {
    return false;
  }
  const name = nameOf(node.key);
  return name !== undefined && RELATION_KEYS.has(name);
}

function collect(
  root: TSESTree.Node,
  visitorKeys: VisitorKeys,
): { mentions: Mention[]; helpers: Set<string>; acknowledged: boolean } {
  const mentions: Mention[] = [];
  const helpers = new Set<string>();
  let acknowledged = false;
  const pending = [root];
  for (const node of pending) {
    appendAll(mentions, textMentions(node));
    if (isRelationKey(node)) {
      continue;
    }
    appendAll(mentions, columnMentions(node));
    for (const name of helperNames(node)) {
      helpers.add(name);
    }
    acknowledged ||= acknowledges(node);
    appendAll(pending, childrenOf(node, visitorKeys));
  }
  return { mentions, helpers, acknowledged };
}

export function readMentions(
  call: TSESTree.Node,
  orms: readonly string[],
  visitorKeys: VisitorKeys,
): Mentions | undefined {
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
  const [primary] = tables;
  if (primary !== undefined) {
    primary.helpers = helpers;
  }
  return { tables, acknowledged };
}
