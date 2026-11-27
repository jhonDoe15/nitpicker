import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { resolveConstant, type SourceContext } from '../analysis/constant-resolution.mts';
import { propertyKeyName } from '../analysis/test-code-analysis.mts';
import { optionValue } from '../processes/output/process-options.mts';
import { calleeMethod, trackedBindings } from '../processes/process-callees.mts';
import { nameOf } from '../typed/node-views.mts';
import { isNamedMember } from '../typed/syntax-views.mts';

type MaybeNode = TSESTree.Node | undefined;

export type ChildCall = {
  readonly command: MaybeNode;
  readonly args: TSESTree.ArrayExpression | undefined;
  readonly options: MaybeNode;
};

const UNKNOWN = 'unknown';

export type EnvKeys = typeof UNKNOWN | ReadonlyMap<string, TSESTree.Node>;

const FLAG_NAMES = /flag|option|opts|args?$|jvm|gc|heap/i;

const CHILD_STARTS = new Set([
  'spawn',
  'spawnSync',
  'execFile',
  'execFileSync',
  'execa',
  'execaSync',
]);

export function childCall(context: SourceContext, call: TSESTree.CallExpression): ChildCall {
  const [command, second, third] = call.arguments;
  const list = resolveConstant(context, second);
  if (list?.type === AST_NODE_TYPES.ArrayExpression) {
    return { command, args: list, options: optionsArgument(third) };
  }
  return { command, args: undefined, options: optionsArgument(second) };
}

function optionsArgument(node: MaybeNode): MaybeNode {
  return node === undefined ||
    node.type === AST_NODE_TYPES.SpreadElement ||
    node.type === AST_NODE_TYPES.ArrowFunctionExpression ||
    node.type === AST_NODE_TYPES.FunctionExpression
    ? undefined
    : node;
}

export function staticText(
  context: SourceContext,
  node: MaybeNode,
  separator = '',
): string | undefined {
  const value = resolveConstant(context, node);
  if (value?.type === AST_NODE_TYPES.Literal && typeof value.value === 'string') {
    return value.value;
  }
  if (value?.type === AST_NODE_TYPES.TemplateLiteral) {
    return value.quasis.map((quasi) => quasi.value.cooked).join(separator);
  }
  return undefined;
}

export function isCommand(
  context: SourceContext,
  command: MaybeNode,
  patterns: { readonly path: RegExp; readonly name: RegExp },
): boolean {
  const text = staticText(context, command);
  if (text !== undefined) {
    return patterns.path.test(text);
  }
  const name = command?.type === AST_NODE_TYPES.MemberExpression ? command.property : command;
  return patterns.name.test(nameOf(name) ?? '');
}

export function argumentTexts(
  context: SourceContext,
  args: TSESTree.ArrayExpression,
): readonly string[] {
  return args.elements.flatMap((element) => {
    if (element === null || element.type === AST_NODE_TYPES.SpreadElement) {
      return [];
    }
    return [staticText(context, element) ?? ''];
  });
}

export function staticArguments(
  context: SourceContext,
  args: TSESTree.ArrayExpression,
): readonly string[] | undefined {
  const texts = args.elements.map((element) => {
    if (element === null || element.type === AST_NODE_TYPES.SpreadElement) {
      return undefined;
    }
    const name = element.type === AST_NODE_TYPES.MemberExpression ? element.property : element;
    return staticText(context, element) ?? (FLAG_NAMES.test(nameOf(name) ?? '') ? undefined : '');
  });
  return texts.every((text) => text !== undefined) ? texts : undefined;
}

function isProcessEnv(node: TSESTree.Node): boolean {
  return isNamedMember(node, 'process', 'env');
}

type EnvEntry = typeof UNKNOWN | readonly [string, TSESTree.Node] | undefined;

function envEntry(property: TSESTree.ObjectLiteralElement): EnvEntry {
  if (property.type === AST_NODE_TYPES.SpreadElement) {
    return isProcessEnv(property.argument) ? undefined : UNKNOWN;
  }
  const name = propertyKeyName(property);
  if (name === undefined) {
    return UNKNOWN;
  }
  return nameOf(property.value) === 'undefined' ? undefined : [name, property.value];
}

export function envKeys(context: SourceContext, options: MaybeNode): EnvKeys {
  const lookup = optionValue(context, options, 'env');
  if (!lookup.known) {
    return UNKNOWN;
  }
  const env = resolveConstant(context, lookup.value);
  if (env === undefined || isProcessEnv(env) || nameOf(env) === 'undefined') {
    return new Map();
  }
  return env.type === AST_NODE_TYPES.ObjectExpression ? objectEnvKeys(env) : UNKNOWN;
}

function objectEnvKeys(env: TSESTree.ObjectExpression): EnvKeys {
  const keys = new Map<string, TSESTree.Node>();
  for (const property of env.properties) {
    const entry = envEntry(property);
    if (entry === UNKNOWN) {
      return UNKNOWN;
    }
    if (entry !== undefined) {
      keys.set(entry[0], entry[1]);
    }
  }
  return keys;
}

export function childStarts(visit: (call: TSESTree.CallExpression) => void): TSESLint.RuleListener {
  return trackedBindings('plain', (current) => ({
    CallExpression(node) {
      if (CHILD_STARTS.has(calleeMethod(node.callee, current()) ?? '')) {
        visit(node);
      }
    },
  }));
}
