import type { TSESTree } from '@typescript-eslint/utils';
import type { SourceCode } from '../../rules/typed/node-views.mts';
import { enclosingFunction } from '../../test-quality/test-calls.mts';

const REFERENCES = new Set(['Identifier', 'MemberExpression']);
const MEMBER_DOTS = new Set(['.', '?.']);

function matchesAt(
  later: readonly TSESTree.Token[],
  wanted: readonly string[],
  index: number,
): boolean {
  const before = later[index - 1]?.value;
  return (
    !(before !== undefined && MEMBER_DOTS.has(before)) &&
    wanted.every((value, offset) => later[index + offset]?.value === value)
  );
}

export function isNarrowedLater(
  sourceCode: SourceCode,
  call: TSESTree.Node,
  subject: TSESTree.Node | undefined,
): boolean {
  if (subject === undefined || !REFERENCES.has(subject.type)) {
    return false;
  }
  const scope = enclosingFunction(call) ?? sourceCode.ast;
  const wanted = sourceCode.getTokens(subject).map((token) => token.value);
  const later = sourceCode.getTokens(scope).filter((token) => token.range[0] >= call.range[1]);
  return later.some((_token, index) => matchesAt(later, wanted, index));
}
