import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { resolveConstant, stringValue } from '../analysis/constant-resolution.mts';
import { memberName, unwrapped, type Context } from '../security/security-values.mts';

const REPLACERS = new Set(['replace', 'replaceAll']);
const BACKSLASH = '\\';
const QUOTED = ['"', "'", '`', '{', '}'];

export type Replacement = {
  readonly call: TSESTree.CallExpression;
  readonly test: (text: string) => boolean;
  readonly source: string;
  readonly text: string | undefined;
};

function patternTest(
  context: Context,
  node: TSESTree.Node,
): { test: (text: string) => boolean; source: string } | undefined {
  const plain = resolveConstant(context, node);
  if (plain?.type === AST_NODE_TYPES.Literal && 'regex' in plain) {
    const pattern = new RegExp(plain.regex.pattern, plain.regex.flags.replace(/[gy]/gu, ''));
    return { test: (text) => pattern.test(text), source: plain.regex.pattern };
  }
  const value = stringValue(plain);
  return value === undefined ? undefined : { test: (text) => text.includes(value), source: value };
}

export function replacementOf(
  context: Context,
  call: TSESTree.CallExpression,
): Replacement | undefined {
  const callee = unwrapped(call.callee);
  const [pattern, replacement] = call.arguments;
  if (
    callee.type !== AST_NODE_TYPES.MemberExpression ||
    !REPLACERS.has(memberName(callee) ?? '') ||
    pattern === undefined ||
    replacement === undefined
  ) {
    return undefined;
  }
  const matcher = patternTest(context, pattern);
  return matcher === undefined
    ? undefined
    : { call, ...matcher, text: stringValue(resolveConstant(context, replacement)) };
}

export function chainOf(context: Context, outermost: TSESTree.CallExpression): Replacement[] {
  const chain: Replacement[] = [];
  const pending: TSESTree.Node[] = [outermost];
  for (const current of pending) {
    if (current.type !== AST_NODE_TYPES.CallExpression) {
      break;
    }
    const replacement = replacementOf(context, current);
    const callee: TSESTree.Node = unwrapped(current.callee);
    if (replacement === undefined || callee.type !== AST_NODE_TYPES.MemberExpression) {
      break;
    }
    chain.unshift(replacement);
    pending.push(unwrapped(callee.object));
  }
  return chain;
}

export function chainRoot(chain: readonly Replacement[]): TSESTree.Node | undefined {
  const callee = chain[0] === undefined ? undefined : unwrapped(chain[0].call.callee);
  return callee?.type === AST_NODE_TYPES.MemberExpression ? unwrapped(callee.object) : undefined;
}

export function isOutermost(context: Context, call: TSESTree.CallExpression): boolean {
  const member = call.parent;
  const outer = member.parent;
  return !(
    member.type === AST_NODE_TYPES.MemberExpression &&
    member.object === call &&
    outer?.type === AST_NODE_TYPES.CallExpression &&
    outer.callee === member &&
    replacementOf(context, outer) !== undefined
  );
}

export function handlesBackslash(step: Replacement): boolean {
  return step.test(BACKSLASH);
}

export function insertsBackslash(step: Replacement): boolean {
  const { text } = step;
  if (
    text === undefined ||
    text.length < 2 ||
    !text.startsWith(BACKSLASH) ||
    handlesBackslash(step)
  ) {
    return false;
  }
  const matched = QUOTED.filter((character) => step.test(character));
  if (!matched.some((character) => step.test(BACKSLASH + character))) {
    return false;
  }
  const rest = text.slice(1);
  return /^\$[&\d]$/u.test(rest) || (rest.length === 1 && rest !== BACKSLASH && step.test(rest));
}

export function isEscapePair(step: Replacement): boolean {
  const pair = BACKSLASH + BACKSLASH;
  return (
    step.text === BACKSLASH &&
    step.test(pair) &&
    !step.test(BACKSLASH) &&
    !step.test(`${BACKSLASH}n`)
  );
}

export function isEscapeSequence(step: Replacement): boolean {
  return (
    step.text !== undefined &&
    !step.text.includes(BACKSLASH) &&
    step.source.length >= 2 &&
    !step.test(BACKSLASH.repeat(2)) &&
    ['"', "'", 'n', 't'].some((letter) => step.test(BACKSLASH + letter))
  );
}
