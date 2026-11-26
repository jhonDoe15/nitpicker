import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import {
  resolveConstant,
  stringValue,
  type SourceContext,
} from '../analysis/constant-resolution.mts';

const RESOLVING_TOOLS = new Set([
  'tsc',
  'eslint',
  'oxlint',
  'tsgolint',
  'node',
  'vite',
  'webpack',
  'rollup',
  'esbuild',
  'jest',
  'vitest',
]);
const SHELL_CALLS = new Set(['exec', 'execSync']);

function programName(text: string): string {
  const base = text.split(/[\\/]/u).pop() ?? '';
  return base.replace(/\.(?:cmd|exe|js|mjs|cjs|bat)$/u, '');
}

function stringOf(context: SourceContext, node: TSESTree.Node | undefined): string | undefined {
  return stringValue(resolveConstant(context, node));
}

function firstArgument(
  context: SourceContext,
  node: TSESTree.Node | undefined,
): string | undefined {
  const value = resolveConstant(context, node);
  if (value?.type !== AST_NODE_TYPES.ArrayExpression) {
    return undefined;
  }
  const [first] = value.elements;
  return first === null || first === undefined ? undefined : stringOf(context, first);
}

export function runsResolvingTool(context: SourceContext, call: TSESTree.CallExpression): boolean {
  const [command, second] = call.arguments;
  const text = stringOf(context, command);
  if (text === undefined) {
    return false;
  }
  const words = SHELL_CALLS.has(
    call.callee.type === AST_NODE_TYPES.Identifier
      ? call.callee.name
      : ((call.callee as TSESTree.MemberExpression).property as TSESTree.Identifier).name,
  )
    ? text.trim().split(/\s+/u)
    : [text];
  const program = programName(words[0] ?? '');
  if (program !== 'npx') {
    return RESOLVING_TOOLS.has(program);
  }
  const next = words[1] ?? firstArgument(context, second);
  return next !== undefined && RESOLVING_TOOLS.has(programName(next));
}
