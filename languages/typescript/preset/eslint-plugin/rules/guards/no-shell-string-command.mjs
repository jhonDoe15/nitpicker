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
        bindings = moduleBindings(node, CHILD_PROCESS);
      },
      CallExpression(node) {
        const name = importedCalleeName(node.callee, bindings);
        const command = node.arguments[0];
        const shellString =
          SHELL_STRING_CALLS.has(name) && command !== undefined && !isPlainString(command);
        const shellOption = ARGUMENT_CALLS.has(name) && node.arguments.slice(1).some(enablesShell);
        if (shellString || shellOption) {
          context.report({ node, messageId: 'shellString' });
        }
      },
    };
  },
};
