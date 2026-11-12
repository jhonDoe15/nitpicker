import { enclosingFunction } from '../../test-quality/test-calls.mjs';

const REFERENCES = new Set(['Identifier', 'MemberExpression']);
const MEMBER_DOTS = new Set(['.', '?.']);

function matchesAt(later, wanted, index) {
  const before = later[index - 1]?.value;
  return (
    !MEMBER_DOTS.has(before) &&
    wanted.every((value, offset) => later[index + offset]?.value === value)
  );
}

export function isNarrowedLater(sourceCode, call, subject) {
  if (!REFERENCES.has(subject?.type)) {
    return false;
  }
  const scope = enclosingFunction(call) ?? sourceCode.ast;
  const wanted = sourceCode.getTokens(subject).map((token) => token.value);
  const later = sourceCode.getTokens(scope).filter((token) => token.range[0] >= call.range[1]);
  return later.some((_token, index) => matchesAt(later, wanted, index));
}
