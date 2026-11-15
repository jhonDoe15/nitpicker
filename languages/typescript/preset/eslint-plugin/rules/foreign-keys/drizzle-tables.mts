import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { staticKeyName } from '../analysis/static-shapes.mts';
import { maybeValue, objectOf, propertiesOf } from '../persistence/orm-bindings.mts';
import type { SourceCode } from '../typed/node-views.mts';
import { initializer, libraryBinding, variableOf } from '../persistence/library-bindings.mts';

type MaybeNode = TSESTree.Node | undefined;
type Columns = (string | undefined)[];
type Namer = (node: TSESTree.Node) => string | undefined;
type FunctionNode = TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression;
type Facts = {
  readonly indexes: Columns[];
  readonly foreignKeys: { readonly node: TSESTree.CallExpression; readonly columns: Columns }[];
};

const DRIZZLE = ['drizzle-orm'];
const TABLES = new Set(['pgTable']);
const PRIMARY_KEY = 'primaryKey';
const KEYED_COLUMN = new Set([PRIMARY_KEY, 'unique']);
const INDEX_BUILDERS = new Set(['index', 'uniqueIndex', 'unique']);
const KEY_BUILDERS = new Set([PRIMARY_KEY, 'foreignKey']);
const MODIFIERS = new Set(['asc', 'desc', 'op', 'nullsFirst', 'nullsLast']);
const NO_FACTS: Facts = { indexes: [], foreignKeys: [] };

function isIn(names: ReadonlySet<string>, name: string | undefined): boolean {
  return name !== undefined && names.has(name);
}

function isName(value: string | undefined): value is string {
  return value !== undefined && value !== '';
}

function isFunction(node: MaybeNode): node is FunctionNode {
  return (
    node?.type === AST_NODE_TYPES.ArrowFunctionExpression ||
    node?.type === AST_NODE_TYPES.FunctionExpression
  );
}

function importedName(sourceCode: SourceCode, callee: MaybeNode): string | undefined {
  const member = callee?.type === AST_NODE_TYPES.MemberExpression ? callee : undefined;
  const base = member === undefined ? callee : member.object;
  if (base?.type !== AST_NODE_TYPES.Identifier) {
    return undefined;
  }
  const binding = libraryBinding(variableOf(sourceCode, base), DRIZZLE);
  if (binding === undefined) {
    return undefined;
  }
  if (member === undefined) {
    return binding.name ?? base.name;
  }
  return binding.name === undefined ? staticKeyName(member) : undefined;
}

function methodName(call: TSESTree.CallExpression): string | undefined {
  return call.callee.type === AST_NODE_TYPES.MemberExpression
    ? staticKeyName(call.callee)
    : undefined;
}

function chainOf(expression: MaybeNode): TSESTree.CallExpression[] {
  const calls: TSESTree.CallExpression[] = [];
  const pending = [expression];
  for (const node of pending) {
    if (node?.type === AST_NODE_TYPES.CallExpression) {
      calls.unshift(node);
      pending.push(
        node.callee.type === AST_NODE_TYPES.MemberExpression ? node.callee.object : undefined,
      );
    }
  }
  return calls;
}

function createdBy(sourceCode: SourceCode, node: MaybeNode, name: string): boolean {
  const created =
    node?.type === AST_NODE_TYPES.Identifier ? initializer(variableOf(sourceCode, node)) : node;
  return (
    created?.type === AST_NODE_TYPES.CallExpression &&
    importedName(sourceCode, created.callee) === name
  );
}

function isTable(sourceCode: SourceCode, call: TSESTree.CallExpression): boolean {
  const { callee } = call;
  if (
    isIn(TABLES, importedName(sourceCode, callee)) ||
    createdBy(sourceCode, callee, 'pgTableCreator')
  ) {
    return true;
  }
  return (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    staticKeyName(callee) === 'table' &&
    createdBy(sourceCode, callee.object, 'pgSchema')
  );
}

function returned(callback: FunctionNode): MaybeNode {
  if (callback.body.type !== AST_NODE_TYPES.BlockStatement) {
    return callback.body;
  }
  return (
    callback.body.body.find(
      (statement): statement is TSESTree.ReturnStatement =>
        statement.type === AST_NODE_TYPES.ReturnStatement,
    )?.argument ?? undefined
  );
}

function columnNamer(parameter: TSESTree.Parameter | undefined): Namer {
  if (parameter?.type === AST_NODE_TYPES.Identifier) {
    return (node) =>
      node.type === AST_NODE_TYPES.MemberExpression &&
      node.object.type === AST_NODE_TYPES.Identifier &&
      node.object.name === parameter.name
        ? staticKeyName(node)
        : undefined;
  }
  const locals = new Map<string, string | undefined>(
    (parameter?.type === AST_NODE_TYPES.ObjectPattern ? parameter.properties : []).flatMap(
      (property): [string, string | undefined][] =>
        property.type === AST_NODE_TYPES.Property &&
        property.value.type === AST_NODE_TYPES.Identifier
          ? [[property.value.name, staticKeyName(property)]]
          : [],
    ),
  );
  return (node) => (node.type === AST_NODE_TYPES.Identifier ? locals.get(node.name) : undefined);
}

function columnsOf(nodes: readonly MaybeNode[], namer: Namer): Columns {
  return nodes.map((node) => {
    const [base] = chainOf(node);
    const unwrapped =
      base !== undefined &&
      isIn(MODIFIERS, methodName(base)) &&
      base.callee.type === AST_NODE_TYPES.MemberExpression
        ? base.callee.object
        : node;
    return unwrapped === undefined ? undefined : namer(unwrapped);
  });
}

function listedColumns(
  sourceCode: SourceCode,
  call: TSESTree.CallExpression,
  namer: Namer,
): Columns {
  const options = propertiesOf(sourceCode, objectOf(sourceCode, call.arguments[0])).get('columns');
  const listed = maybeValue(sourceCode, options?.value);
  return listed?.type === AST_NODE_TYPES.ArrayExpression
    ? columnsOf(
        listed.elements.map((element) => element ?? undefined),
        namer,
      )
    : columnsOf(call.arguments, namer);
}

function indexFacts(rest: readonly TSESTree.CallExpression[], namer: Namer): Facts {
  if (rest.some((call) => methodName(call) === 'where')) {
    return NO_FACTS;
  }
  const on = rest.find((call) => methodName(call) === 'on');
  const using = rest.find((call) => methodName(call) === 'using');
  return {
    indexes: [columnsOf(on?.arguments ?? using?.arguments.slice(1) ?? [], namer)],
    foreignKeys: [],
  };
}

function builderFacts(sourceCode: SourceCode, expression: MaybeNode, namer: Namer): Facts {
  const [first, ...rest] = chainOf(expression);
  const builder = first === undefined ? undefined : importedName(sourceCode, first.callee);
  if (isIn(INDEX_BUILDERS, builder)) {
    return indexFacts(rest, namer);
  }
  if (first === undefined || !isIn(KEY_BUILDERS, builder)) {
    return NO_FACTS;
  }
  const columns = listedColumns(sourceCode, first, namer);
  return builder === PRIMARY_KEY
    ? { indexes: [columns], foreignKeys: [] }
    : { indexes: [], foreignKeys: [{ node: first, columns }] };
}

function extraEntries(sourceCode: SourceCode, config: MaybeNode): Facts[] {
  const callback = maybeValue(sourceCode, config);
  if (!isFunction(callback)) {
    return [];
  }
  const namer = columnNamer(callback.params[0]);
  const body = returned(callback);
  const entries: readonly MaybeNode[] =
    body?.type === AST_NODE_TYPES.ArrayExpression
      ? body.elements.map((element) => element ?? undefined)
      : [];
  const values =
    body?.type === AST_NODE_TYPES.ObjectExpression
      ? [...propertiesOf(sourceCode, body).values()]
      : [];
  return [...entries, ...values.map((property) => property.value)].map((node) =>
    builderFacts(sourceCode, node, namer),
  );
}

function columnObject(sourceCode: SourceCode, columns: MaybeNode): MaybeNode {
  const value = maybeValue(sourceCode, columns);
  return isFunction(value) ? returned(value) : value;
}

function columnFacts(sourceCode: SourceCode, columns: MaybeNode): Facts[] {
  const object = objectOf(sourceCode, columnObject(sourceCode, columns));
  return [...propertiesOf(sourceCode, object)].flatMap(([name, property]): Facts[] => {
    const chain = chainOf(property.value);
    const references = chain.find((call) => methodName(call) === 'references');
    if (chain.some((call) => isIn(KEYED_COLUMN, methodName(call)))) {
      return [{ indexes: [[name]], foreignKeys: [] }];
    }
    return references === undefined
      ? []
      : [{ indexes: [], foreignKeys: [{ node: references, columns: [name] }] }];
  });
}

function isLeadingCover(index: Columns, columns: Columns): boolean {
  const lead = index.slice(0, columns.length);
  return columns.every((column) => lead.includes(column));
}

export function unindexedTableKeys(
  sourceCode: SourceCode,
  call: TSESTree.CallExpression,
): { readonly node: TSESTree.CallExpression; readonly columns: string[] }[] {
  if (!isTable(sourceCode, call)) {
    return [];
  }
  const [, columns, config] = call.arguments;
  const facts = [...columnFacts(sourceCode, columns), ...extraEntries(sourceCode, config)];
  const indexes = facts.flatMap((fact) => fact.indexes);
  return facts
    .flatMap((fact) => fact.foreignKeys)
    .flatMap(({ node, columns: keys }) =>
      keys.every(isName) && !indexes.some((index) => isLeadingCover(index, keys))
        ? [{ node, columns: keys.filter(isName) }]
        : [],
    );
}
