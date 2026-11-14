import { ts } from '../../../../typescript-api/typescript-api.mjs';
import { descendants, normalizedText } from '../syntax.mjs';

const UNIT_TESTS = [
  ts.isFunctionDeclaration,
  ts.isMethodDeclaration,
  ts.isArrowFunction,
  ts.isFunctionExpression,
];

export function isAsync(unit) {
  return (ts.getModifiers(unit) ?? []).some(({ kind }) => kind === ts.SyntaxKind.AsyncKeyword);
}

function parameterProblem(parameter) {
  const plain =
    ts.isIdentifier(parameter.name) &&
    parameter.initializer === undefined &&
    parameter.dotDotDotToken === undefined &&
    parameter.questionToken === undefined &&
    parameter.name.text !== 'this' &&
    ts.getModifiers(parameter) === undefined &&
    ts.getDecorators(parameter) === undefined;
  return plain ? undefined : 'a parameter is optional, destructured, a rest or has a default';
}

function kindProblem([a, b]) {
  if (!UNIT_TESTS.some((test) => test(a)) || a.kind !== b.kind) {
    return 'the copies are not both functions or methods of one kind';
  }
  const bodies = [a, b].map(({ body }) => body);
  if (bodies.includes(undefined) || ts.isBlock(bodies[0]) !== ts.isBlock(bodies[1])) {
    return 'the copies have different kinds of body';
  }
  return [a, b].some(
    (unit) => unit.asteriskToken !== undefined || unit.typeParameters !== undefined,
  )
    ? 'a copy is a generator or has type parameters'
    : undefined;
}

function signatureProblem([a, b], sourceFile) {
  if (isAsync(a) !== isAsync(b) || a.parameters.length !== b.parameters.length) {
    return 'the copies differ in async or in their parameters';
  }
  const returns = [a, b].map(({ type }) => type && normalizedText(type, sourceFile));
  return returns[0] === returns[1] ? undefined : 'the copies declare different return types';
}

export function unitProblem(units, sourceFile) {
  const parameters = units.flatMap((unit) => [...unit.parameters]);
  return (
    kindProblem(units) ??
    signatureProblem(units, sourceFile) ??
    parameters.map(parameterProblem).find((found) => found !== undefined)
  );
}

function commentTexts(unit, sourceFile) {
  const texts = new Set();
  for (const node of descendants(unit.body)) {
    const ranges = [
      ...(ts.getLeadingCommentRanges(sourceFile.text, node.pos) ?? []),
      ...(ts.getTrailingCommentRanges(sourceFile.text, node.end) ?? []),
    ];
    for (const range of ranges) {
      texts.add(sourceFile.text.slice(range.pos, range.end).replaceAll(/\s+/gu, ' '));
    }
  }
  return texts;
}

export function lostComments(units, sourceFile) {
  const [kept, dropped] = units.map((unit) => commentTexts(unit, sourceFile));
  return [...dropped].some((text) => !kept.has(text));
}
