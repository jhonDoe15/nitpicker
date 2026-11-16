import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { depthFirst } from '../typed/node-views.mts';
import { resolveConstant, stringValue, type SourceContext } from './constant-resolution.mts';
import { importedCalleeName, type ModuleBindings } from './node/subprocess-bindings.mts';

export {
  importedCalleeName,
  isPromisify,
  moduleBindings,
  subprocessBindings,
  withPromisified,
  type ModuleBindings,
} from './node/subprocess-bindings.mts';

export type Subprocess = {
  readonly command: string | undefined;
  readonly commandNode: TSESTree.CallExpressionArgument | undefined;
  readonly argsNode: TSESTree.CallExpressionArgument | undefined;
  readonly tokens: readonly string[];
  readonly optionsNode: TSESTree.CallExpressionArgument | undefined;
};

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

function staticText(node: TSESTree.Node | undefined): string | undefined {
  if (node?.type === AST_NODE_TYPES.Literal && typeof node.value === 'string') {
    return node.value;
  }
  if (node?.type === AST_NODE_TYPES.TemplateLiteral) {
    return node.quasis.map((quasi) => quasi.value.cooked ?? '').join('X');
  }
  return undefined;
}

function expressionChildren(
  node: TSESTree.Node | undefined,
): readonly (TSESTree.Node | undefined)[] {
  if (node?.type === AST_NODE_TYPES.CallExpression) {
    return node.arguments;
  }
  return node?.type === AST_NODE_TYPES.BinaryExpression ? [node.left, node.right] : [];
}

function containsBinPath(node: TSESTree.Node | undefined): boolean {
  for (const candidate of depthFirst(node, expressionChildren)) {
    const text = staticText(candidate);
    if (text !== undefined && /(?:^|\/)node_modules\/\.bin(?:\/|$)/.test(text)) {
      return true;
    }
  }
  return false;
}

function commandName(context: SourceContext, node: TSESTree.Node | undefined): string | undefined {
  const resolved = resolveConstant(context, node);
  if (
    resolved?.type === AST_NODE_TYPES.MemberExpression &&
    !resolved.computed &&
    resolved.object.type === AST_NODE_TYPES.Identifier &&
    resolved.object.name === 'process' &&
    resolved.property.type === AST_NODE_TYPES.Identifier &&
    resolved.property.name === 'execPath'
  ) {
    return 'node';
  }
  if (containsBinPath(resolved)) {
    return 'package-bin';
  }
  return stringValue(resolved);
}

export function literalTokens(context: SourceContext, node: TSESTree.Node | undefined): string[] {
  const resolved = resolveConstant(context, node);
  const value = stringValue(resolved);
  if (value !== undefined) {
    return [value];
  }
  if (resolved?.type === AST_NODE_TYPES.ArrayExpression) {
    return resolved.elements.flatMap((element) => {
      if (element === null || element.type === AST_NODE_TYPES.SpreadElement) {
        return [];
      }
      return [stringValue(element) ?? ''];
    });
  }
  return [];
}

function isArgumentList(context: SourceContext, node: TSESTree.Node | undefined): boolean {
  if (!node || node.type === AST_NODE_TYPES.SpreadElement) {
    return node !== undefined;
  }
  return resolveConstant(context, node)?.type !== AST_NODE_TYPES.ObjectExpression;
}

function argumentFormSubprocess(
  context: SourceContext,
  call: TSESTree.CallExpression,
  command: string | undefined,
): Subprocess {
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

function shellFormSubprocess(context: SourceContext, call: TSESTree.CallExpression): Subprocess {
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

export function describeSubprocess(
  context: SourceContext,
  call: TSESTree.Node,
  bindings: ModuleBindings,
): Subprocess | undefined {
  if (call.type !== AST_NODE_TYPES.CallExpression) {
    return undefined;
  }
  const name = importedCalleeName(call.callee, bindings);
  if (name === undefined) {
    return undefined;
  }
  if (NODE_FORM_FUNCTIONS.has(name)) {
    return argumentFormSubprocess(context, call, 'node');
  }
  if (FILE_FORM_FUNCTIONS.has(name)) {
    return argumentFormSubprocess(context, call, commandName(context, call.arguments[0]));
  }
  if (SHELL_FORM_FUNCTIONS.has(name)) {
    return shellFormSubprocess(context, call);
  }
  return undefined;
}

export function gitSubcommand(tokens: readonly string[]): string | undefined {
  const remaining = tokens.values();
  for (const token of remaining) {
    if (GIT_OPTIONS_WITH_VALUE.has(token)) {
      remaining.next();
      continue;
    }
    if (!token.startsWith('-')) {
      return token;
    }
  }
  return undefined;
}
