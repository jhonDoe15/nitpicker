import { depthFirst } from '../../../../../../shared/traversal.mjs';
import { resolveConstant, stringValue } from './constant-resolution.mjs';
import { CHILD_PROCESS_MODULES, EXECA_MODULES } from './node/node-sync-modules.mjs';

const SUBPROCESS_MODULES = new Set([...CHILD_PROCESS_MODULES, ...EXECA_MODULES, 'cross-spawn']);
const FILE_FORM_FUNCTIONS = new Set([
  'execFileSync',
  'execFile',
  'spawn',
  'spawnSync',
  'execa',
  'execaSync',
  'execaNode',
]);
const SHELL_FORM_FUNCTIONS = new Set(['execSync', 'exec', 'execaCommand', 'execaCommandSync']);
const NODE_FORM_FUNCTIONS = new Set(['fork', 'execaNode']);
const GIT_OPTIONS_WITH_VALUE = new Set(['-c', '-C', '--git-dir', '--work-tree', '--namespace']);
const DEFAULT_IMPORT_NAMES = new Map([
  ['execa', 'execa'],
  ['cross-spawn', 'spawn'],
]);

function importedName(specifier) {
  return specifier.imported.type === 'Identifier'
    ? specifier.imported.name
    : specifier.imported.value;
}

function addImportBindings(statement, bindings) {
  if (statement.importKind === 'type') return;
  for (const specifier of statement.specifiers) {
    if (specifier.type === 'ImportSpecifier') {
      bindings.named.set(specifier.local.name, importedName(specifier));
    } else {
      bindings.namespaces.add(specifier.local.name);
    }
  }
}

function isRequireOf(init, modules) {
  return (
    init?.type === 'CallExpression' &&
    init.callee.type === 'Identifier' &&
    init.callee.name === 'require' &&
    modules.has(stringValue(init.arguments[0]))
  );
}

function isIdentifierProperty(property) {
  return (
    property.type === 'Property' &&
    property.key.type === 'Identifier' &&
    property.value.type === 'Identifier'
  );
}

function addRequireBindings(pattern, bindings) {
  if (pattern.type === 'Identifier') bindings.namespaces.add(pattern.name);
  if (pattern.type !== 'ObjectPattern') return;
  for (const property of pattern.properties.filter(isIdentifierProperty)) {
    bindings.named.set(property.value.name, property.key.name);
  }
}

function addStatementBindings(statement, modules, bindings) {
  if (statement.type === 'ImportDeclaration' && modules.has(statement.source.value)) {
    addImportBindings(statement, bindings);
  }
  if (statement.type !== 'VariableDeclaration') return;
  for (const declarator of statement.declarations) {
    if (isRequireOf(declarator.init, modules)) addRequireBindings(declarator.id, bindings);
  }
}

export function moduleBindings(program, modules) {
  const bindings = { named: new Map(), namespaces: new Set() };
  for (const statement of program.body) addStatementBindings(statement, modules, bindings);
  return bindings;
}

export function importedCalleeName(callee, bindings) {
  if (callee.type === 'Identifier') return bindings.named.get(callee.name);
  if (
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    callee.object.type === 'Identifier' &&
    bindings.namespaces.has(callee.object.name) &&
    callee.property.type === 'Identifier'
  ) {
    return callee.property.name;
  }
  return undefined;
}

function defaultImportLocals(statement) {
  return statement.specifiers
    .filter((specifier) => specifier.type === 'ImportDefaultSpecifier')
    .map((specifier) => specifier.local.name);
}

export function subprocessBindings(program) {
  const bindings = moduleBindings(program, SUBPROCESS_MODULES);
  for (const statement of program.body) {
    const name =
      statement.type === 'ImportDeclaration'
        ? DEFAULT_IMPORT_NAMES.get(statement.source.value)
        : undefined;
    if (name === undefined) continue;
    for (const local of defaultImportLocals(statement)) bindings.named.set(local, name);
  }
  return bindings;
}

function staticText(node) {
  if (node?.type === 'Literal' && typeof node.value === 'string') return node.value;
  if (node?.type === 'TemplateLiteral') {
    return node.quasis.map((quasi) => quasi.value.cooked ?? '').join('X');
  }
  return undefined;
}

function expressionChildren(node) {
  if (node?.type === 'CallExpression') return node.arguments;
  return node?.type === 'BinaryExpression' ? [node.left, node.right] : [];
}

function containsBinPath(node) {
  for (const candidate of depthFirst(node, expressionChildren)) {
    const text = staticText(candidate);
    if (text !== undefined && /(?:^|\/)node_modules\/\.bin(?:\/|$)/.test(text)) return true;
  }
  return false;
}

function commandName(context, node) {
  const resolved = resolveConstant(context, node);
  if (
    resolved?.type === 'MemberExpression' &&
    !resolved.computed &&
    resolved.object.type === 'Identifier' &&
    resolved.object.name === 'process' &&
    resolved.property.type === 'Identifier' &&
    resolved.property.name === 'execPath'
  ) {
    return 'node';
  }
  if (containsBinPath(resolved)) return 'package-bin';
  return stringValue(resolved);
}

export function literalTokens(context, node) {
  const resolved = resolveConstant(context, node);
  const value = stringValue(resolved);
  if (value !== undefined) return [value];
  if (resolved?.type === 'ArrayExpression') {
    return resolved.elements.flatMap((element) => {
      if (!element || element.type === 'SpreadElement') return [];
      return [stringValue(element) ?? ''];
    });
  }
  return [];
}

function isArgumentList(context, node) {
  if (!node || node.type === 'SpreadElement') return node !== undefined;
  return resolveConstant(context, node)?.type !== 'ObjectExpression';
}

function argumentFormSubprocess(context, call, command) {
  const [first, second, third] = call.arguments;
  const hasArgs = isArgumentList(context, second);
  return {
    command,
    commandNode: first,
    argsNode: hasArgs ? second : undefined,
    tokens: hasArgs ? literalTokens(context, second) : [],
    optionsNode: hasArgs ? third : second,
  };
}

function shellFormSubprocess(context, call) {
  const [first, second] = call.arguments;
  const text = staticText(resolveConstant(context, first));
  const words = text === undefined ? [] : text.trim().split(/\s+/);
  return {
    command: words[0],
    commandNode: first,
    argsNode: first,
    tokens: words.slice(1),
    optionsNode: second,
  };
}

export function describeSubprocess(context, call, bindings) {
  if (call.type !== 'CallExpression') return undefined;
  const name = importedCalleeName(call.callee, bindings);
  if (name === undefined) return undefined;
  if (NODE_FORM_FUNCTIONS.has(name)) return argumentFormSubprocess(context, call, 'node');
  if (FILE_FORM_FUNCTIONS.has(name)) {
    return argumentFormSubprocess(context, call, commandName(context, call.arguments[0]));
  }
  if (SHELL_FORM_FUNCTIONS.has(name)) return shellFormSubprocess(context, call);
  return undefined;
}

export function gitSubcommand(tokens) {
  const remaining = tokens.values();
  for (const token of remaining) {
    if (GIT_OPTIONS_WITH_VALUE.has(token)) {
      remaining.next();
      continue;
    }
    if (!token.startsWith('-')) return token;
  }
  return undefined;
}
