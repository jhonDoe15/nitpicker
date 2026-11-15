import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { suggestible } from '../../fixes/support/descriptors.mts';
import { dropShellFix, execFileFix } from '../../fixes/processes/shell-command-fix.mts';
import {
  resolveConstant,
  stringValue,
  type SourceContext,
} from '../analysis/constant-resolution.mts';
import {
  importedCalleeName,
  moduleBindings,
  withPromisified,
  type ModuleBindings,
} from '../analysis/subprocess-calls.mts';
import { variableNamed, type SourceCode } from '../typed/node-views.mts';

type Node = TSESTree.Node;
type MessageId = 'shellString' | 'shellProgram' | 'useExecFile' | 'dropShell';
type Wrapper =
  TSESTree.TSAsExpression | TSESTree.TSSatisfiesExpression | TSESTree.TSNonNullExpression;

const { DefinitionType } = TSESLint.Scope;
const CHILD_PROCESS = new Set(['child_process', 'node:child_process']);
const SHELL_STRING_CALLS = new Set<string>(['exec', 'execSync']);
const ARGUMENT_CALLS = new Set<string>(['spawn', 'spawnSync', 'execFile', 'execFileSync']);
const SHELL_PROGRAMS = new Set<string>([
  'sh',
  'bash',
  'zsh',
  'dash',
  'ksh',
  'fish',
  'cmd',
  'cmd.exe',
]);

function isWrapper(node: Node | undefined): node is Wrapper {
  return (
    node?.type === AST_NODE_TYPES.TSAsExpression ||
    node?.type === AST_NODE_TYPES.TSSatisfiesExpression ||
    node?.type === AST_NODE_TYPES.TSNonNullExpression
  );
}

function isPlainString(node: Node): boolean {
  return (
    (node.type === AST_NODE_TYPES.Literal && typeof node.value === 'string') ||
    (node.type === AST_NODE_TYPES.TemplateLiteral && node.expressions.length === 0)
  );
}

function resolvedValue(context: SourceContext, node: Node | undefined): Node | undefined {
  const chain = [resolveConstant(context, node)];
  for (const current of chain) {
    if (isWrapper(current)) {
      chain.push(resolveConstant(context, current.expression));
    }
  }
  return chain.at(-1);
}

function keyText(key: Node): unknown {
  if (key.type === AST_NODE_TYPES.Identifier) {
    return key.name;
  }
  return key.type === AST_NODE_TYPES.Literal ? key.value : undefined;
}

function isShellProperty(property: TSESTree.ObjectLiteralElement): boolean {
  return (
    property.type === AST_NODE_TYPES.Property &&
    keyText(property.key) === 'shell' &&
    !(property.value.type === AST_NODE_TYPES.Literal && property.value.value === false)
  );
}

function enablesShell(context: SourceContext, options: Node): boolean {
  const pending: Node[] = [options];
  for (const current of pending) {
    const object = resolvedValue(context, current);
    if (object?.type !== AST_NODE_TYPES.ObjectExpression) {
      continue;
    }
    if (object.properties.some(isShellProperty)) {
      return true;
    }
    const spreads = object.properties.filter(
      (property) => property.type === AST_NODE_TYPES.SpreadElement,
    );
    pending.push(...spreads.map((spread) => spread.argument));
  }
  return false;
}

function isCommandFlag(token: string | undefined): boolean {
  if (token === '/c' || token === '/C') {
    return true;
  }
  const letters = token?.startsWith('-') === true ? token.slice(1) : '';
  return /^[A-Za-z]+$/.test(letters) && letters.includes('c');
}

function shellCommand(
  context: SourceContext,
  call: TSESTree.CallExpression,
): { program: string; flag: string | undefined; command: Node } | undefined {
  const program = stringValue(resolvedValue(context, call.arguments[0]));
  const list = resolvedValue(context, call.arguments[1]);
  const last = program?.split(/[\\/]/).at(-1);
  if (
    program === undefined ||
    last === undefined ||
    !SHELL_PROGRAMS.has(last) ||
    list?.type !== AST_NODE_TYPES.ArrayExpression
  ) {
    return undefined;
  }
  const flagIndex = list.elements.findIndex((element) => isCommandFlag(stringValue(element)));
  const command = flagIndex === -1 ? undefined : list.elements[flagIndex + 1];
  return command === undefined || command === null || command.type === AST_NODE_TYPES.SpreadElement
    ? undefined
    : { program, flag: stringValue(list.elements[flagIndex]), command };
}

function isFixedCommand(sourceCode: SourceCode, command: Node): boolean {
  if (isPlainString(command)) {
    return true;
  }
  const definition =
    command.type === AST_NODE_TYPES.Identifier
      ? variableNamed(sourceCode, command)?.defs.at(0)
      : undefined;
  return (
    definition?.type === DefinitionType.Variable &&
    definition.parent.kind === 'const' &&
    isPlainString(definition.node.init ?? command)
  );
}

export const rule: TSESLint.RuleModule<MessageId> = {
  meta: {
    type: 'problem',
    hasSuggestions: true,
    docs: { description: 'Disallow running a shell command built from a string' },
    schema: [],
    messages: {
      shellString:
        'A shell command built from a variable or template is a command injection risk. Run the program with `execFile(program, [args])` or `spawn(program, [args])`, one argument per array entry. If the command is fixed and trusted, write it as a plain string literal.',
      shellProgram:
        '`{{program}} {{flag}}` runs a command built from a variable or template through a shell, a command injection risk like `exec`. Run the program itself with `execFile(program, [args])`, one argument per array entry. If the command is fixed and trusted, write it as a plain string literal.',
      useExecFile: 'Run the program with its arguments as an array, without a shell.',
      dropShell: 'Remove the `shell` option so each argument reaches the program as it is.',
    },
  },
  create(context) {
    let bindings: ModuleBindings = { named: new Map(), namespaces: new Set() };
    return {
      Program(node) {
        bindings = withPromisified(node, moduleBindings(node, CHILD_PROCESS));
      },
      CallExpression(node) {
        const name = importedCalleeName(node.callee, bindings);
        if (name === undefined) {
          return;
        }
        const command = node.arguments[0];
        const shellString =
          SHELL_STRING_CALLS.has(name) &&
          command !== undefined &&
          !isFixedCommand(context.sourceCode, command);
        const argumentCall = ARGUMENT_CALLS.has(name);
        const shellOption =
          argumentCall && node.arguments.slice(1).some((options) => enablesShell(context, options));
        if (shellString || shellOption) {
          const suggestion: {
            readonly id: 'useExecFile' | 'dropShell';
            readonly plan: ReturnType<typeof dropShellFix>;
          } = shellString
            ? { id: 'useExecFile', plan: execFileFix(context.sourceCode, node, name) }
            : { id: 'dropShell', plan: dropShellFix(context.sourceCode, node) };
          context.report(
            suggestible<MessageId>(
              { node, messageId: 'shellString' },
              { messageId: suggestion.id, plan: suggestion.plan },
            ),
          );
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
