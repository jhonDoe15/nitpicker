import { depthFirst, objectChildren } from '../../../../../../shared/traversal.mjs';
import { chainOf, scopeChain } from './ancestry.mjs';

const SUBPROCESS_MODULES = new Set(['child_process', 'node:child_process', 'execa', 'cross-spawn']);
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
const PER_TEST_TESTS = new Set(['it', 'test']);
const REGISTRATION_FACTORIES = new Set(['each', 'for', 'extend', 'runIf', 'skipIf', 'todo']);
const MAX_RESOLVE_DEPTH = 8;

function isFunctionNode(node) {
  return (
    node?.type === 'ArrowFunctionExpression' ||
    node?.type === 'FunctionExpression' ||
    node?.type === 'FunctionDeclaration'
  );
}

function stringValue(node) {
  if (node?.type === 'Literal' && typeof node.value === 'string') return node.value;
  if (node?.type === 'TemplateLiteral' && node.expressions.length === 0) {
    return node.quasis[0].value.cooked ?? undefined;
  }
  return undefined;
}

export function findVariable(context, node, name) {
  for (const scope of scopeChain(context.sourceCode.getScope(node))) {
    const variable = scope.set.get(name);
    if (variable) return variable;
  }
  return undefined;
}

function constantInitializer(context, node, depth) {
  if (node?.type !== 'Identifier' || depth > MAX_RESOLVE_DEPTH) return undefined;
  const variable = findVariable(context, node, node.name);
  const definition = variable?.defs.length === 1 ? variable.defs[0] : undefined;
  return definition?.type === 'Variable' &&
    definition.parent.kind === 'const' &&
    definition.node.id.type === 'Identifier'
    ? definition.node.init
    : undefined;
}

export function resolveConstant(context, node, depth = 0) {
  let current = node;
  for (const currentDepth of Array.from(
    { length: Math.max(0, MAX_RESOLVE_DEPTH - depth + 1) },
    (_, index) => depth + index,
  )) {
    const next = constantInitializer(context, current, currentDepth);
    if (!next) return current;
    current = next;
  }
  return current;
}

function resolveFunction(context, node) {
  if (node?.type !== 'Identifier') return undefined;
  const variable = findVariable(context, node, node.name);
  const definition = variable?.defs.length === 1 ? variable.defs[0] : undefined;
  if (definition?.type === 'FunctionName') return definition.node;
  if (definition?.type === 'Variable' && definition.parent.kind === 'const') {
    const init = definition.node.init;
    return isFunctionNode(init) ? init : undefined;
  }
  return undefined;
}

const NUMBER_OPERATORS = {
  '*': (left, right) => left * right,
  '+': (left, right) => left + right,
  '-': (left, right) => left - right,
  '/': (left, right) => left / right,
};

function numericChildren(frame, context) {
  if (frame.depth > MAX_RESOLVE_DEPTH) return [];
  frame.resolved = resolveConstant(context, frame.node);
  const node = frame.resolved;
  let children = [];
  if (node?.type === 'UnaryExpression' && ['-', '+'].includes(node.operator))
    children = [node.argument];
  if (node?.type === 'BinaryExpression' && Object.hasOwn(NUMBER_OPERATORS, node.operator))
    children = [node.left, node.right];
  frame.children = children.map((child) => ({ node: child, depth: frame.depth + 1 }));
  return frame.children;
}

function numericValue(frame, values) {
  const node = frame.resolved;
  if (node?.type === 'Literal' && typeof node.value === 'number') return node.value;
  const operands = frame.children?.map((child) => values.get(child)) ?? [];
  if (operands.length === 0 || operands.some((value) => value === undefined)) return undefined;
  if (node.type === 'UnaryExpression') return node.operator === '-' ? -operands[0] : operands[0];
  return NUMBER_OPERATORS[node.operator](...operands);
}

export function constantNumber(context, node, depth = 0) {
  const root = { node, depth };
  const frames = [...depthFirst(root, (frame) => numericChildren(frame, context))];
  const values = new Map();
  for (const frame of frames.toReversed()) values.set(frame, numericValue(frame, values));
  return values.get(root);
}

export function moduleBindings(program, modules) {
  const named = new Map();
  const namespaces = new Set();
  for (const statement of program.body) {
    if (statement.type === 'ImportDeclaration' && modules.has(statement.source.value)) {
      if (statement.importKind === 'type') continue;
      for (const specifier of statement.specifiers) {
        if (specifier.type === 'ImportSpecifier') {
          const imported =
            specifier.imported.type === 'Identifier'
              ? specifier.imported.name
              : specifier.imported.value;
          named.set(specifier.local.name, imported);
        } else {
          namespaces.add(specifier.local.name);
        }
      }
    }
    if (statement.type === 'VariableDeclaration') {
      for (const declarator of statement.declarations) {
        const init = declarator.init;
        if (
          init?.type !== 'CallExpression' ||
          init.callee.type !== 'Identifier' ||
          init.callee.name !== 'require' ||
          !modules.has(stringValue(init.arguments[0]))
        ) {
          continue;
        }
        if (declarator.id.type === 'Identifier') namespaces.add(declarator.id.name);
        if (declarator.id.type === 'ObjectPattern') {
          for (const property of declarator.id.properties) {
            if (
              property.type === 'Property' &&
              property.key.type === 'Identifier' &&
              property.value.type === 'Identifier'
            ) {
              named.set(property.value.name, property.key.name);
            }
          }
        }
      }
    }
  }
  return { named, namespaces };
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

export function subprocessBindings(program) {
  const bindings = moduleBindings(program, SUBPROCESS_MODULES);
  for (const statement of program.body) {
    if (statement.type !== 'ImportDeclaration') continue;
    for (const specifier of statement.specifiers) {
      if (specifier.type !== 'ImportDefaultSpecifier') continue;
      if (statement.source.value === 'execa') bindings.named.set(specifier.local.name, 'execa');
      if (statement.source.value === 'cross-spawn') {
        bindings.named.set(specifier.local.name, 'spawn');
      }
    }
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

function literalTokens(context, node) {
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

export function describeSubprocess(context, call, bindings) {
  if (call.type !== 'CallExpression') return undefined;
  const name = importedCalleeName(call.callee, bindings);
  if (name === undefined) return undefined;
  const [first, second, third] = call.arguments;
  if (NODE_FORM_FUNCTIONS.has(name)) {
    const hasArgs = isArgumentList(context, second);
    return {
      command: 'node',
      commandNode: first,
      argsNode: hasArgs ? second : undefined,
      tokens: hasArgs ? literalTokens(context, second) : [],
      optionsNode: hasArgs ? third : second,
    };
  }
  if (FILE_FORM_FUNCTIONS.has(name)) {
    const hasArgs = isArgumentList(context, second);
    return {
      command: commandName(context, first),
      commandNode: first,
      argsNode: hasArgs ? second : undefined,
      tokens: hasArgs ? literalTokens(context, second) : [],
      optionsNode: hasArgs ? third : second,
    };
  }
  if (SHELL_FORM_FUNCTIONS.has(name)) {
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
  return undefined;
}

export function gitSubcommand(tokens) {
  const remaining = tokens.values();
  for (const token of remaining) {
    if (GIT_OPTIONS_WITH_VALUE.has(token)) {
      remaining.next();
    } else if (!token.startsWith('-')) {
      return token;
    }
  }
  return undefined;
}

function parameterNames(fn) {
  return fn.params.flatMap((parameter) => {
    if (parameter.type === 'Identifier') return [parameter.name];
    if (parameter.type === 'RestElement' && parameter.argument.type === 'Identifier') {
      return [parameter.argument.name];
    }
    if (parameter.type === 'AssignmentPattern' && parameter.left.type === 'Identifier') {
      return [parameter.left.name];
    }
    return [];
  });
}

function referencesAny(node, names) {
  for (const candidate of depthFirst(node, objectChildren)) {
    if (candidate?.type === 'Identifier' && names.has(candidate.name)) return true;
  }
  return false;
}

function forEachNode(context, root, visit) {
  const pending = [root];
  for (const node of pending) {
    visit(node);
    for (const key of context.sourceCode.visitorKeys[node.type] ?? []) {
      const value = node[key];
      if (Array.isArray(value)) {
        for (const child of value) if (child) pending.push(child);
      } else if (value) {
        pending.push(value);
      }
    }
  }
}

export function describeWrapperCall(context, call, bindings) {
  if (call.type !== 'CallExpression') return undefined;
  const fn = resolveFunction(context, call.callee);
  if (!fn) return undefined;
  const parameters = parameterNames(fn);
  const names = new Set(parameters);
  const found = [];
  forEachNode(context, fn.body, (node) => {
    if (found.length > 0 || node.type !== 'CallExpression') return;
    const inner = describeSubprocess(context, node, bindings);
    if (!inner) return;
    const commandIndex =
      inner.commandNode?.type === 'Identifier' ? parameters.indexOf(inner.commandNode.name) : -1;
    if (commandIndex >= 0) {
      const command = stringValue(resolveConstant(context, call.arguments[commandIndex]));
      const tokens = call.arguments
        .filter((_argument, index) => index !== commandIndex)
        .flatMap((argument) => literalTokens(context, argument));
      found.push({ inner, node, command, tokens });
      return;
    }
    if (inner.command !== undefined && referencesAny(inner.argsNode, names)) {
      const tokens = [
        ...inner.tokens,
        ...call.arguments.flatMap((argument) => literalTokens(context, argument)),
      ];
      found.push({ inner, node, command: inner.command, tokens });
    }
  });
  return found[0];
}

function registrationRoot(callee) {
  const root = chainOf(callee, (link) => {
    if (link.type === 'MemberExpression') return link.object;
    return link.type === 'CallExpression' ? link.callee : undefined;
  }).at(-1);
  return root?.type === 'Identifier' ? root.name : undefined;
}

function perTestCallback(call, hooks = ['beforeEach']) {
  const root = registrationRoot(call.callee);
  if (root === undefined || !(PER_TEST_TESTS.has(root) || hooks.includes(root))) return undefined;
  if (
    call.callee.type === 'MemberExpression' &&
    !call.callee.computed &&
    REGISTRATION_FACTORIES.has(call.callee.property.name)
  ) {
    return undefined;
  }
  return [...call.arguments].reverse().find(isFunctionNode);
}

export function perTestVisitors(context, check, hooks) {
  const reported = new Set();
  return {
    CallExpression(registration) {
      const callback = perTestCallback(registration, hooks);
      if (!callback) return;
      const visited = new Set([callback]);
      const pending = [callback.body];
      for (const body of pending) {
        forEachNode(context, body, (node) => {
          if (node.type !== 'CallExpression' && node.type !== 'NewExpression') return;
          if (!reported.has(node)) {
            const report = check(node);
            if (report) {
              reported.add(node);
              context.report({ node, ...report });
            }
          }
          const fn =
            node.type === 'CallExpression' ? resolveFunction(context, node.callee) : undefined;
          if (fn && !visited.has(fn)) {
            visited.add(fn);
            pending.push(fn.body);
          }
        });
      }
    },
  };
}
