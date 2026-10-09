// Shared syntax helpers for the rules that look at what a test does per test: which callbacks run
// once per test, which same-file functions they reach, and which calls start a child process.
// Everything here works on one file's syntax tree; calls into other modules are not followed.

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
// Members that return a registration function instead of registering a test themselves.
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

/** The variable `name` refers to at `node`, found through the scope chain. */
export function findVariable(context, node, name) {
  let scope = context.sourceCode.getScope(node);
  while (scope) {
    const variable = scope.set.get(name);
    if (variable) return variable;
    scope = scope.upper;
  }
  return undefined;
}

/** The initializer of the `const` an identifier refers to, followed through const aliases. */
export function resolveConstant(context, node, depth = 0) {
  if (node?.type !== 'Identifier' || depth > MAX_RESOLVE_DEPTH) return node;
  const variable = findVariable(context, node, node.name);
  const definition = variable?.defs.length === 1 ? variable.defs[0] : undefined;
  if (
    definition?.type !== 'Variable' ||
    definition.parent.kind !== 'const' ||
    definition.node.id.type !== 'Identifier' ||
    !definition.node.init
  ) {
    return node;
  }
  return resolveConstant(context, definition.node.init, depth + 1);
}

/** The same-file function an identifier names: a function declaration or a const function. */
export function resolveFunction(context, node) {
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

/** Number value of a literal, a const, or arithmetic over those; undefined when not constant. */
export function constantNumber(context, node, depth = 0) {
  if (depth > MAX_RESOLVE_DEPTH) return undefined;
  const resolved = resolveConstant(context, node);
  if (resolved?.type === 'Literal' && typeof resolved.value === 'number') return resolved.value;
  if (resolved?.type === 'UnaryExpression' && ['-', '+'].includes(resolved.operator)) {
    const value = constantNumber(context, resolved.argument, depth + 1);
    if (value === undefined) return undefined;
    return resolved.operator === '-' ? -value : value;
  }
  if (resolved?.type === 'BinaryExpression' && ['*', '+', '-', '/'].includes(resolved.operator)) {
    const left = constantNumber(context, resolved.left, depth + 1);
    const right = constantNumber(context, resolved.right, depth + 1);
    if (left === undefined || right === undefined) return undefined;
    if (resolved.operator === '*') return left * right;
    if (resolved.operator === '+') return left + right;
    if (resolved.operator === '-') return left - right;
    return left / right;
  }
  return undefined;
}

/**
 * Local names bound by imports or `require` destructuring of the given modules: `named` maps a
 * local name to the imported name, `namespaces` holds namespace, default and whole-module names.
 */
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

/** The imported name a callee refers to (`spawnSync`, `cp.spawnSync`), or undefined. */
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

function containsBinPath(node) {
  if (!node || typeof node !== 'object') return false;
  const text = staticText(node);
  if (text !== undefined && /(?:^|\/)node_modules\/\.bin(?:\/|$)/.test(text)) return true;
  if (node.type === 'CallExpression') return node.arguments.some(containsBinPath);
  if (node.type === 'BinaryExpression')
    return containsBinPath(node.left) || containsBinPath(node.right);
  return false;
}

/** `node` for process.execPath, a package bin path, or a literal command name. */
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

// Literal argument tokens; a non-literal array element becomes '' so positions stay aligned.
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

/**
 * Describes a direct child-process call: its command (`node` for process.execPath and fork,
 * `package-bin` for a node_modules/.bin path, else the literal name), the literal argument tokens,
 * and the nodes holding the command, the argument list and the options.
 */
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

/** The git subcommand among the tokens, skipping global options such as `-c key=value`. */
export function gitSubcommand(tokens) {
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (GIT_OPTIONS_WITH_VALUE.has(token)) {
      index += 1;
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
  if (!node || typeof node !== 'object') return false;
  if (node.type === 'Identifier') return names.has(node.name);
  return Object.entries(node).some(
    ([key, value]) =>
      key !== 'parent' &&
      (Array.isArray(value)
        ? value.some((child) => referencesAny(child, names))
        : value !== null && typeof value === 'object' && referencesAny(value, names)),
  );
}

function forEachNode(context, root, visit) {
  const pending = [root];
  while (pending.length > 0) {
    const node = pending.pop();
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

/**
 * For a call to a same-file wrapper around a child-process call (`git(root, ['init'])`,
 * `run('git', args)`), the wrapped call and the command and tokens the call site supplies.
 */
export function describeWrapperCall(context, call, bindings) {
  if (call.type !== 'CallExpression') return undefined;
  const fn = resolveFunction(context, call.callee);
  if (!fn) return undefined;
  const parameters = parameterNames(fn);
  const names = new Set(parameters);
  let described;
  forEachNode(context, fn.body, (node) => {
    if (described || node.type !== 'CallExpression') return;
    const inner = describeSubprocess(context, node, bindings);
    if (!inner) return;
    const commandIndex =
      inner.commandNode?.type === 'Identifier' ? parameters.indexOf(inner.commandNode.name) : -1;
    if (commandIndex >= 0) {
      const command = stringValue(resolveConstant(context, call.arguments[commandIndex]));
      const tokens = call.arguments
        .filter((_argument, index) => index !== commandIndex)
        .flatMap((argument) => literalTokens(context, argument));
      described = { inner, node, command, tokens };
      return;
    }
    if (inner.command !== undefined && referencesAny(inner.argsNode, names)) {
      const tokens = [
        ...inner.tokens,
        ...call.arguments.flatMap((argument) => literalTokens(context, argument)),
      ];
      described = { inner, node, command: inner.command, tokens };
    }
  });
  return described;
}

function registrationRoot(callee) {
  let current = callee;
  while (current) {
    if (current.type === 'Identifier') return current.name;
    if (current.type === 'MemberExpression') current = current.object;
    else if (current.type === 'CallExpression') current = current.callee;
    else return undefined;
  }
  return undefined;
}

/**
 * The callback a per-test registration runs: `it`/`test` (with `.each`, `.only`, `.concurrent`
 * and the like) and, when `hooks` names them, hooks such as `beforeEach`.
 */
export function perTestCallback(call, hooks = ['beforeEach']) {
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

/**
 * Builds visitors that call `check(node)` for every call and `new` expression reached from a
 * per-test callback, following calls to same-file functions. `check` returns a report descriptor
 * or undefined; each node is reported once however many tests reach it.
 */
export function perTestVisitors(context, check, hooks) {
  const reported = new Set();
  return {
    CallExpression(registration) {
      const callback = perTestCallback(registration, hooks);
      if (!callback) return;
      const visited = new Set([callback]);
      const pending = [callback.body];
      while (pending.length > 0) {
        forEachNode(context, pending.pop(), (node) => {
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
