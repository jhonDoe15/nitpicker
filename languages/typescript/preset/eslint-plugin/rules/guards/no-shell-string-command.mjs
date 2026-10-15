import { variableNamed } from '../ancestry.mjs';
import { importedCalleeName, moduleBindings } from '../test-code-analysis.mjs';

const CHILD_PROCESS = new Set(['child_process', 'node:child_process']);
const SHELL_STRING_CALLS = new Set(['exec', 'execSync']);
const ARGUMENT_CALLS = new Set(['spawn', 'spawnSync', 'execFile', 'execFileSync']);

function isPlainString(node) {
  return (
    (node.type === 'Literal' && typeof node.value === 'string') ||
    (node.type === 'TemplateLiteral' && node.expressions.length === 0)
  );
}

function enablesShell(options) {
  return (
    options?.type === 'ObjectExpression' &&
    options.properties.some(
      (property) =>
        property.type === 'Property' &&
        (property.key.name ?? property.key.value) === 'shell' &&
        !(property.value.type === 'Literal' && property.value.value === false),
    )
  );
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
        'A shell command built from a variable or template is a command injection risk. Run the program with `execFile(program, [args])` or `spawn(program, [args])`, one argument per array entry. If the command is fixed and trusted, write it as a plain string literal, or add an exception for this rule in nitpicker.config.json.',
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
        const shellOption = ARGUMENT_CALLS.has(name) && node.arguments.slice(1).some(enablesShell);
        if (shellString || shellOption) {
          context.report({ node, messageId: 'shellString' });
        }
      },
    };
  },
};
