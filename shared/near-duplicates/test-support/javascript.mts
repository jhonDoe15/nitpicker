import { parse } from 'acorn';
import type {
  AnonymousFunctionDeclaration,
  AnyNode,
  ArrowFunctionExpression,
  BinaryExpression,
  Expression,
  FunctionDeclaration,
  FunctionExpression,
  LogicalExpression,
  Pattern,
  PrivateIdentifier,
  SourceLocation,
  Statement,
  VariableDeclaration,
} from 'acorn';
import { depthFirst } from '../../traversal.mts';
import { NONE, present } from '../tree/nodes.mts';
import type { NearUnit, TreeFields, TreeNode } from '../tree/tree-types.mts';

export type JavascriptUnit = NearUnit & { readonly start: number; readonly end: number };

type Kinds = { [Node in AnyNode as Node['type']]: Node };
type Converted = TreeNode | TreeNode[];
type Settings = { readonly bound: ReadonlySet<string>; readonly commutes: boolean };
type Context = {
  readonly get: (source: AnyNode) => TreeNode;
  readonly many: (source: AnyNode) => TreeNode[];
  readonly settings: Settings;
};
type Converters = { [Kind in keyof Kinds]?: (source: Kinds[Kind], context: Context) => Converted };
type FunctionSource =
  AnonymousFunctionDeclaration | FunctionDeclaration | ArrowFunctionExpression | FunctionExpression;

const COMMUTING = new Set(['+', '*']);
const BLOCK = 'block';
const STATEMENT = 'statement';

function isNode(value: unknown): value is AnyNode {
  return (
    typeof value === 'object' && value !== null && 'type' in value && typeof value.type === 'string'
  );
}

function childrenOf(source: AnyNode): AnyNode[] {
  return Object.entries(source)
    .filter(([key]) => key !== 'loc')
    .flatMap(([, value]): unknown[] =>
      Array.isArray(value) ? Array.from<unknown>(value) : [value],
    )
    .filter(isNode);
}

function declaredBy(source: AnyNode): readonly (Pattern | undefined)[] {
  if (source.type === 'VariableDeclarator') {
    return [source.id];
  }
  if (source.type === 'CatchClause') {
    return [source.param ?? undefined];
  }
  return 'params' in source ? source.params : [];
}

function patternParts(pattern: Pattern | undefined): readonly (Pattern | undefined)[] {
  if (pattern?.type === 'ArrayPattern') {
    return pattern.elements.map((element) => element ?? undefined);
  }
  return pattern?.type === 'ObjectPattern'
    ? pattern.properties.map((part) => ('value' in part ? part.value : undefined))
    : [];
}

function declaredNames(root: AnyNode): Set<string> {
  return new Set(
    [...depthFirst(root, childrenOf)]
      .flatMap(declaredBy)
      .flatMap((pattern) => [...depthFirst(pattern, patternParts)])
      .flatMap((pattern) => (pattern?.type === 'Identifier' ? [pattern.name] : [])),
  );
}

function locationOf(source: AnyNode): SourceLocation {
  const { loc } = source;
  if (loc === undefined || loc === null) {
    throw new TypeError('The parsed syntax has no location');
  }
  return loc;
}

function node(
  kind: string,
  source: AnyNode,
  children: readonly TreeNode[] = [],
  fields: TreeFields = {},
): TreeNode {
  const { start, end } = locationOf(source);
  return { kind, children, ...fields, start: start.line, end: end.line };
}

function literalKind(source: { readonly regex?: object; readonly value?: unknown }): string {
  if (source.regex !== undefined) {
    return 'regexp';
  }
  return source.value === null ? 'null' : typeof source.value;
}

function optional<Value>(value: Value, convert: (value: NonNullable<Value>) => TreeNode): TreeNode {
  return value === null || value === undefined ? NONE : convert(value);
}

function blockOf(source: Statement, { many }: Context): TreeNode {
  return source.type === 'BlockStatement'
    ? present(many(source)[0])
    : node(BLOCK, source, many(source));
}

function forInit(
  init: VariableDeclaration | Expression | undefined,
  { get, many }: Context,
): TreeNode[] {
  if (init === undefined) {
    return [];
  }
  return init.type === 'VariableDeclaration' ? many(init) : [node('evaluate', init, [get(init)])];
}

function parametersOf(source: FunctionSource, { get }: Context): TreeNode {
  return node(
    'parameters',
    source,
    source.params.map((param) => node('parameter', param, [NONE, get(param)])),
  );
}

function labelled(kind: string, source: AnyNode, label: { readonly name: string } | undefined) {
  return [node(kind, source, [], { value: label?.name })];
}

function declaredId(left: VariableDeclaration | Pattern): Pattern {
  if (left.type !== 'VariableDeclaration') {
    throw new TypeError('A for-of loop needs a declaration');
  }
  return present(left.declarations[0]).id;
}

const STATEMENTS: Converters = {
  BlockStatement: (source, { many }) => [node(BLOCK, source, source.body.flatMap(many))],
  IfStatement: (source, context) => [
    node('if', source, [
      context.get(source.test),
      blockOf(source.consequent, context),
      optional(source.alternate, (alternate) => blockOf(alternate, context)),
    ]),
  ],
  ReturnStatement: (source, { get }) => [node('return', source, [optional(source.argument, get)])],
  ThrowStatement: (source, { get }) => [node('throw', source, [get(source.argument)])],
  BreakStatement: (source) => labelled('break', source, source.label ?? undefined),
  ContinueStatement: (source) => labelled('continue', source, source.label ?? undefined),
  ExpressionStatement: (source, { get }) => [node('evaluate', source, [get(source.expression)])],
  VariableDeclaration: (source, { get }) => source.declarations.map(get),
  VariableDeclarator: (source, { get }) =>
    node('declare', source, [NONE, get(source.id), optional(source.init, get)]),
  ForStatement: (source, context) => [
    node('for', source, [
      node(BLOCK, source, forInit(source.init ?? undefined, context)),
      optional(source.test, context.get),
      node(BLOCK, source, forInit(source.update ?? undefined, context)),
      blockOf(source.body, context),
    ]),
  ],
  WhileStatement: (source, context) => [
    node('while', source, [context.get(source.test), blockOf(source.body, context)]),
  ],
  DoWhileStatement: (source, context) => [
    node('do', source, [blockOf(source.body, context), context.get(source.test)]),
  ],
  ForOfStatement: (source, context) => [
    node('foreach', source, [
      NONE,
      context.get(declaredId(source.left)),
      context.get(source.right),
      blockOf(source.body, context),
    ]),
  ],
  SwitchStatement: (source, { get }) => [
    node(STATEMENT, source, [get(source.discriminant), ...source.cases.map(get)], {
      value: 'switch',
    }),
  ],
  SwitchCase: (source, { get, many }) =>
    node(
      STATEMENT,
      source,
      [optional(source.test, get), node(BLOCK, source, source.consequent.flatMap(many))],
      { value: 'case' },
    ),
  TryStatement: (source, context) => [
    node(
      STATEMENT,
      source,
      [
        blockOf(source.block, context),
        optional(source.handler, context.get),
        optional(source.finalizer, (finalizer) => blockOf(finalizer, context)),
      ],
      { value: 'try' },
    ),
  ],
  CatchClause: (source, context) =>
    node(STATEMENT, source, [optional(source.param, context.get), blockOf(source.body, context)], {
      value: 'catch',
    }),
  LabeledStatement: (source, context) => [
    node(STATEMENT, source, [blockOf(source.body, context)], {
      value: `label:${source.label.name}`,
    }),
  ],
  EmptyStatement: () => [],
};

function binaryOf(
  source: BinaryExpression | LogicalExpression,
  { get, settings }: Context,
): TreeNode {
  const commutes = settings.commutes && COMMUTING.has(source.operator);
  return node('binary', source, [get(source.left), get(source.right)], {
    value: source.operator,
    ...(commutes ? { commutes: true } : {}),
  });
}

function lambdaOf(
  source: ArrowFunctionExpression | FunctionExpression,
  context: Context,
): TreeNode {
  const body =
    source.body.type === 'BlockStatement'
      ? blockOf(source.body, context)
      : context.get(source.body);
  return node('lambda', source, [parametersOf(source, context), body]);
}

function nameOf(source: AnyNode & { readonly name: string }, { settings }: Context): TreeNode {
  const binding = settings.bound.has(source.name) ? 'bound' : 'free';
  return node('name', source, [], { binding, value: source.name, text: source.name });
}

function nameText(property: Expression | PrivateIdentifier): string | undefined {
  return 'name' in property ? property.name : undefined;
}

function memberOf(
  source: AnyNode & {
    readonly computed: boolean;
    readonly object: AnyNode;
    readonly property: Expression | PrivateIdentifier;
  },
  { get }: Context,
): TreeNode {
  return source.computed
    ? node('index', source, [get(source.object), get(source.property)])
    : node('member', source, [get(source.object)], { value: nameText(source.property) });
}

function elementsOf(elements: readonly unknown[], { get }: Context): TreeNode[] {
  return elements.map((element) => (isNode(element) ? get(element) : NONE));
}

function grouped(value: string, source: AnyNode, children: readonly TreeNode[]): TreeNode {
  return node('expression', source, children, { value });
}

function keyText(key: Expression | PrivateIdentifier): string {
  if ('name' in key) {
    return key.name;
  }
  return 'value' in key ? String(key.value) : 'undefined';
}

const EXPRESSIONS: Converters = {
  Identifier: (source, context) => nameOf(source, context),
  Literal: (source) =>
    node('literal', source, [], { literal: literalKind(source), value: String(source.raw) }),
  ThisExpression: (source) => node('this', source),
  BinaryExpression: binaryOf,
  LogicalExpression: binaryOf,
  UnaryExpression: (source, { get }) =>
    node('unary', source, [get(source.argument)], { value: source.operator }),
  UpdateExpression: (source, { get }) =>
    node('update', source, [get(source.argument)], {
      value: `${source.prefix ? 'prefix' : 'postfix'}${source.operator}`,
    }),
  AssignmentExpression: (source, { get }) =>
    node('assign', source, [get(source.left), get(source.right)], { value: source.operator }),
  ConditionalExpression: (source, { get }) =>
    node('conditional', source, [get(source.test), get(source.consequent), get(source.alternate)]),
  CallExpression: (source, { get }) =>
    node('call', source, [get(source.callee), ...source.arguments.map(get)]),
  NewExpression: (source, { get }) =>
    node('new', source, [
      node('type', source.callee, [], {
        value: source.callee.type === 'Identifier' ? source.callee.name : undefined,
      }),
      ...source.arguments.map(get),
    ]),
  MemberExpression: memberOf,
  ArrowFunctionExpression: lambdaOf,
  FunctionExpression: lambdaOf,
  ArrayExpression: (source, context) =>
    grouped('array', source, elementsOf(source.elements, context)),
  ObjectExpression: (source, { get }) => grouped('object', source, source.properties.map(get)),
  Property: (source, { get }) =>
    grouped(`property:${keyText(source.key)}`, source, [get(source.value)]),
  TemplateLiteral: (source, { get }) =>
    grouped('template', source, [...source.quasis.map(get), ...source.expressions.map(get)]),
  ArrayPattern: (source, context) =>
    grouped('array-pattern', source, elementsOf(source.elements, context)),
  ObjectPattern: (source, { get }) => grouped('object-pattern', source, source.properties.map(get)),
  TemplateElement: (source) =>
    node('literal', source, [], { literal: 'string', value: source.value.raw }),
  FunctionDeclaration: (source, context) =>
    node('function', source, [NONE, parametersOf(source, context), blockOf(source.body, context)]),
};

const CONVERTERS: Converters = { ...STATEMENTS, ...EXPRESSIONS };

function convertOne<Kind extends keyof Kinds>(
  kind: Kind,
  source: Kinds[Kind],
  context: Context,
): Converted {
  const convert = CONVERTERS[kind];
  if (convert === undefined) {
    throw new Error(`unsupported syntax ${kind}`);
  }
  return convert(source, context);
}

function isList(converted: Converted | undefined): converted is TreeNode[] {
  return Array.isArray(converted);
}

function convertFunction(root: FunctionDeclaration, settings: Settings): TreeNode {
  const converted = new Map<AnyNode, Converted>();
  const context: Context = {
    get(source) {
      const found = present(converted.get(source));
      if (isList(found)) {
        throw new TypeError(`${source.type} converts to a list of nodes`);
      }
      return found;
    },
    many(source) {
      const found = present(converted.get(source));
      return isList(found) ? found : [found];
    },
    settings,
  };
  for (const source of [...depthFirst<AnyNode>(root, childrenOf)].toReversed()) {
    converted.set(source, convertOne(source.type, source, context));
  }
  return context.get(root);
}

export function javascriptUnits(
  source: string,
  { file = 'sample.js', commutes }: { readonly file?: string; readonly commutes?: true } = {},
): JavascriptUnit[] {
  const program = parse(source, { ecmaVersion: 'latest', sourceType: 'module', locations: true });
  return program.body
    .map((item) => (item.type === 'ExportNamedDeclaration' ? item.declaration : item))
    .flatMap((item) => (item?.type === 'FunctionDeclaration' ? [item] : []))
    .map((item) => {
      const { start, end } = locationOf(item);
      return {
        id: `${file}#${item.id.name}`,
        file,
        name: item.id.name,
        start: start.line,
        end: end.line,
        final: true,
        tree: convertFunction(item, { bound: declaredNames(item), commutes: commutes === true }),
      };
    });
}
