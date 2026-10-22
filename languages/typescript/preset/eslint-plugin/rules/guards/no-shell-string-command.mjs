import { variableNamed } from '../analysis/ancestry.mjs';
import { resolveConstant, stringValue } from '../analysis/constant-resolution.mjs';
import { importedCalleeName, moduleBindings } from '../analysis/subprocess-calls.mjs';

const CHILD_PROCESS = new Set(['child_process', 'node:child_process']);
const SHELL_STRING_CALLS = new Set(['exec', 'execSync']);
const ARGUMENT_CALLS = new Set(['spawn', 'spawnSync', 'execFile', 'execFileSync']);
const SHELL_PROGRAMS = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh', 'fish', 'cmd', 'cmd.exe']);
const TYPE_WRAPPERS = new Set(['TSAsExpression', 'TSSatisfiesExpression', 'TSNonNullExpression']);

function isPlainString(node) {
  return (
    (node.type === 'Literal' && typeof node.value === 'string') ||
    (node.type === 'TemplateLiteral' && node.expressions.length === 0)
  );
}

function resolvedValue(context, node) {
  const chain = [resolveConstant(context, node)];
  for (const current of chain) {
    if (TYPE_WRAPPERS.has(current?.type)) {
      chain.push(resolveConstant(context, current.expression));
    }
  }
  return chain.at(-1);
}

function isShellProperty(property) {
  return (
    property.type === 'Property' &&
    (property.key.name ?? property.key.value) === 'shell' &&
    !(property.value.type === 'Literal' && property.value.value === false)
  );
}

function enablesShell(context, options) {
  const pending = [options];
  for (const current of pending) {
    const object = resolvedValue(context, current);
    if (object?.type !== 'ObjectExpression') {
      continue;
    }
    if (object.properties.some(isShellProperty)) {
      return true;
    }
    const spreads = object.properties.filter((property) => property.type === 'SpreadElement');
    pending.push(...spreads.map((spread) => spread.argument));
  }
  return false;
}

function isCommandFlag(token) {
  if (token === '/c' || token === '/C') {
    return true;
  }
  const letters = token?.startsWith('-') === true ? token.slice(1) : '';
  return /^[A-Za-z]+$/.test(letters) && letters.includes('c');
}

function shellCommand(context, call) {
  const program = stringValue(resolvedValue(context, call.arguments[0]));
  const list = resolvedValue(context, call.arguments[1]);
  if (!SHELL_PROGRAMS.has(program?.split(/[\\/]/).at(-1)) || list?.type !== 'ArrayExpression') {
    return undefined;
  }
  const flagIndex = list.elements.findIndex((element) => isCommandFlag(stringValue(element)));
  const command = flagIndex === -1 ? undefined : list.elements[flagIndex + 1];
  return command === undefined || command === null || command.type === 'SpreadElement'
    ? undefined
    : { program, flag: stringValue(list.elements[flagIndex]), command };
}

function isPromisify(callee) {
  return (
    (callee.type === 'Identifier' && callee.name === 'promisify') ||
    (callee.type === 'MemberExpression' && callee.property.name === 'promisify')
  );
}

function withPromisified(program, bindings) {
  const named = new Map(bindings.named);
  const declarators = program.body
    .flatMap((statement) =>
      statement.type === 'VariableDeclaration' ? statement.declarations : [],
    )
    .filter(({ id, init }) => id.type === 'Identifier' && init?.type === 'CallExpression');
  for (const { id, init } of declarators) {
    const [wrapped] = init.arguments;
    const name = wrapped === undefined ? undefined : importedCalleeName(wrapped, bindings);
    if (isPromisify(init.callee) && name !== undefined) {
      named.set(id.name, name);
    }
  }
  return { ...bindings, named };
}

function isFixedCommand(sourceCode, command) {
  if (isPlainString(command)) {
    return true;
  }
  const definition =
    command.type === 'Identifier' ? variableNamed(sourceCode, command)?.defs.at(0) : undefined;
  return (
    definition?.type === 'Variable' &&
    definition.parent.kind === 'const' &&
    isPlainString(definition.node.init ?? command)
  );
}

export const rule = {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow running a shell command built from a string' },
    schema: [],
    messages: {
      shellString:
        'A shell command built from a variable or template is a command injection risk. Run the program with `execFile(program, [args])` or `spawn(program, [args])`, one argument per array entry. If the command is fixed and trusted, write it as a plain string literal.',
      shellProgram:
        '`{{program}} {{flag}}` runs a command built from a variable or template through a shell, a command injection risk like `exec`. Run the program itself with `execFile(program, [args])`, one argument per array entry. If the command is fixed and trusted, write it as a plain string literal.',
    },
  },
  create(context) {
    let bindings = { named: new Map(), namespaces: new Set() };
    return {
      Program(node) {
        bindings = withPromisified(node, moduleBindings(node, CHILD_PROCESS));
      },
      CallExpression(node) {
        const name = importedCalleeName(node.callee, bindings);
        const command = node.arguments[0];
        const shellString =
          SHELL_STRING_CALLS.has(name) &&
          command !== undefined &&
          !isFixedCommand(context.sourceCode, command);
        const argumentCall = ARGUMENT_CALLS.has(name);
        const shellOption =
          argumentCall && node.arguments.slice(1).some((options) => enablesShell(context, options));
        if (shellString || shellOption) {
          context.report({ node, messageId: 'shellString' });
          return;
        }
        const shell = argumentCall ? shellCommand(context, node) : undefined;
        if (shell !== undefined && !isFixedCommand(context.sourceCode, shell.command)) {
          const { program, flag } = shell;
          context.report({ node, messageId: 'shellProgram', data: { program, flag } });
        }
      },
    };
  },
};
