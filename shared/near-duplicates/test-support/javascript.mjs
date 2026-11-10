import { parse } from 'acorn';
import { depthFirst } from '../../traversal.mjs';

const NONE = { kind: 'none', children: [] };
const COMMUTING = new Set(['+', '*']);

function childrenOf(source) {
  return Object.entries(source)
    .filter(([key]) => key !== 'loc')
    .flatMap(([, value]) => (Array.isArray(value) ? value : [value]))
    .filter((value) => typeof value?.type === 'string');
}

function declaredBy(source) {
  if (source.type === 'VariableDeclarator') {
    return [source.id];
  }
  if (source.type === 'CatchClause') {
    return [source.param];
  }
  return source.params ?? [];
}

function patternParts(pattern) {
  if (pattern?.type === 'ArrayPattern') {
    return pattern.elements;
  }
  return pattern?.type === 'ObjectPattern' ? pattern.properties.map((part) => part.value) : [];
}

function declaredNames(root) {
  return new Set(
    [...depthFirst(root, childrenOf)]
      .flatMap(declaredBy)
      .flatMap((pattern) => [...depthFirst(pattern, patternParts)])
      .filter((pattern) => pattern?.type === 'Identifier')
      .map((pattern) => pattern.name),
  );
}

function node(kind, source, children = [], fields = {}) {
  return { kind, children, ...fields, start: source.loc.start.line, end: source.loc.end.line };
}

function literalKind(source) {
  if (source.regex !== undefined) {
    return 'regexp';
  }
  return source.value === null ? 'null' : typeof source.value;
}

function optional(value, convert) {
  return value === null || value === undefined ? NONE : convert(value);
}

function blockOf(source, get) {
  return source.type === 'BlockStatement' ? get(source)[0] : node('block', source, get(source));
}

function forInit(init, get) {
  if (init === null) {
    return [];
  }
  return init.type === 'VariableDeclaration' ? get(init) : [node('evaluate', init, [get(init)])];
}

function parametersOf(source, get) {
  return node(
    'parameters',
    source,
    source.params.map((param) => node('parameter', param, [NONE, get(param)])),
  );
}

function labelled(kind, source) {
  return [node(kind, source, [], { value: source.label?.name })];
}

const STATEMENTS = {
  BlockStatement: (source, get) => [node('block', source, source.body.flatMap(get))],
  IfStatement: (source, get) => [
    node('if', source, [
      get(source.test),
      blockOf(source.consequent, get),
      optional(source.alternate, (alternate) => blockOf(alternate, get)),
    ]),
  ],
  ReturnStatement: (source, get) => [node('return', source, [optional(source.argument, get)])],
  ThrowStatement: (source, get) => [node('throw', source, [get(source.argument)])],
  BreakStatement: (source) => labelled('break', source),
  ContinueStatement: (source) => labelled('continue', source),
  ExpressionStatement: (source, get) => [node('evaluate', source, [get(source.expression)])],
  VariableDeclaration: (source, get) => source.declarations.map(get),
  VariableDeclarator: (source, get) =>
    node('declare', source, [NONE, get(source.id), optional(source.init, get)]),
  ForStatement: (source, get) => [
    node('for', source, [
      node('block', source, forInit(source.init, get)),
      optional(source.test, get),
      node('block', source, forInit(source.update, get)),
      blockOf(source.body, get),
    ]),
  ],
  WhileStatement: (source, get) => [
    node('while', source, [get(source.test), blockOf(source.body, get)]),
  ],
  DoWhileStatement: (source, get) => [
    node('do', source, [blockOf(source.body, get), get(source.test)]),
  ],
  ForOfStatement: (source, get) => [
    node('foreach', source, [
      NONE,
      get(source.left.declarations[0].id),
      get(source.right),
      blockOf(source.body, get),
    ]),
  ],
  SwitchStatement: (source, get) => [
    node('statement', source, [get(source.discriminant), ...source.cases.map(get)], {
      value: 'switch',
    }),
  ],
  SwitchCase: (source, get) =>
    node(
      'statement',
      source,
      [optional(source.test, get), node('block', source, source.consequent.flatMap(get))],
      { value: 'case' },
    ),
  TryStatement: (source, get) => [
    node(
      'statement',
      source,
      [
        blockOf(source.block, get),
        optional(source.handler, get),
        optional(source.finalizer, (finalizer) => blockOf(finalizer, get)),
      ],
      { value: 'try' },
    ),
  ],
  CatchClause: (source, get) =>
    node('statement', source, [optional(source.param, get), blockOf(source.body, get)], {
      value: 'catch',
    }),
  LabeledStatement: (source, get) => [
    node('statement', source, [blockOf(source.body, get)], {
      value: `label:${source.label.name}`,
    }),
  ],
  EmptyStatement: () => [],
};

function binaryOf(source, get, options) {
  const commutes = options.commutes && COMMUTING.has(source.operator);
  return node('binary', source, [get(source.left), get(source.right)], {
    value: source.operator,
    ...(commutes ? { commutes: true } : {}),
  });
}

function lambdaOf(source, get) {
  const body = source.body.type === 'BlockStatement' ? blockOf(source.body, get) : get(source.body);
  return node('lambda', source, [parametersOf(source, get), body]);
}

function nameOf(source, options) {
  const binding = options.bound.has(source.name) ? 'bound' : 'free';
  return node('name', source, [], { binding, value: source.name, text: source.name });
}

function memberOf(source, get) {
  return source.computed
    ? node('index', source, [get(source.object), get(source.property)])
    : node('member', source, [get(source.object)], { value: source.property.name });
}

function elementsOf(source, get) {
  return source.elements.map((element) => optional(element, get));
}

function grouped(value, source, children) {
  return node('expression', source, children, { value });
}

const EXPRESSIONS = {
  Identifier: (source, _get, options) => nameOf(source, options),
  Literal: (source) =>
    node('literal', source, [], { literal: literalKind(source), value: String(source.raw) }),
  ThisExpression: (source) => node('this', source),
  BinaryExpression: binaryOf,
  LogicalExpression: binaryOf,
  UnaryExpression: (source, get) =>
    node('unary', source, [get(source.argument)], { value: source.operator }),
  UpdateExpression: (source, get) =>
    node('update', source, [get(source.argument)], {
      value: `${source.prefix ? 'prefix' : 'postfix'}${source.operator}`,
    }),
  AssignmentExpression: (source, get) =>
    node('assign', source, [get(source.left), get(source.right)], { value: source.operator }),
  ConditionalExpression: (source, get) =>
    node('conditional', source, [get(source.test), get(source.consequent), get(source.alternate)]),
  CallExpression: (source, get) =>
    node('call', source, [get(source.callee), ...source.arguments.map(get)]),
  NewExpression: (source, get) =>
    node('new', source, [
      node('type', source.callee, [], { value: source.callee.name }),
      ...source.arguments.map(get),
    ]),
  MemberExpression: memberOf,
  ArrowFunctionExpression: lambdaOf,
  FunctionExpression: lambdaOf,
  ArrayExpression: (source, get) => grouped('array', source, elementsOf(source, get)),
  ObjectExpression: (source, get) => grouped('object', source, source.properties.map(get)),
  Property: (source, get) =>
    grouped(`property:${source.key.name ?? source.key.value}`, source, [get(source.value)]),
  TemplateLiteral: (source, get) =>
    grouped('template', source, [...source.quasis.map(get), ...source.expressions.map(get)]),
  ArrayPattern: (source, get) => grouped('array-pattern', source, elementsOf(source, get)),
  ObjectPattern: (source, get) => grouped('object-pattern', source, source.properties.map(get)),
  TemplateElement: (source) =>
    node('literal', source, [], { literal: 'string', value: source.value.raw }),
  FunctionDeclaration: (source, get) =>
    node('function', source, [NONE, parametersOf(source, get), blockOf(source.body, get)]),
};

const CONVERTERS = { ...STATEMENTS, ...EXPRESSIONS };

function convertFunction(root, options) {
  const converted = new Map();
  const get = converted.get.bind(converted);
  for (const source of [...depthFirst(root, childrenOf)].toReversed()) {
    const convert = CONVERTERS[source.type];
    if (convert === undefined) {
      throw new Error(`unsupported syntax ${source.type}`);
    }
    converted.set(source, convert(source, get, options));
  }
  return converted.get(root);
}

export function javascriptUnits(source, { file = 'sample.js', commutes = false } = {}) {
  const program = parse(source, { ecmaVersion: 'latest', sourceType: 'module', locations: true });
  return program.body
    .map((item) => (item.type === 'ExportNamedDeclaration' ? item.declaration : item))
    .filter((item) => item?.type === 'FunctionDeclaration')
    .map((item) => ({
      id: `${file}#${item.id.name}`,
      file,
      name: item.id.name,
      start: item.loc.start.line,
      end: item.loc.end.line,
      tree: convertFunction(item, { bound: declaredNames(item), commutes }),
    }));
}
