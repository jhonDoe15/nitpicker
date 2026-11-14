import { ts } from '../../../../typescript-api/typescript-api.mjs';
import { normalizedText } from '../syntax.mjs';

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

function tokensUnder(root, sourceFile) {
  const found = [];
  const pending = [root];
  for (const node of pending) {
    found.push(node);
    pending.push(...node.getChildren(sourceFile));
  }
  return found;
}

function commentsIn(roots, sourceFile, range) {
  const texts = new Set();
  for (const node of roots.flatMap((root) => tokensUnder(root, sourceFile))) {
    const ranges = [
      ...(ts.getLeadingCommentRanges(sourceFile.text, node.pos) ?? []),
      ...(ts.getTrailingCommentRanges(sourceFile.text, node.end) ?? []),
    ];
    for (const found of ranges.filter((each) => each.pos >= range.pos && each.end <= range.end)) {
      texts.add(sourceFile.text.slice(found.pos, found.end).replaceAll(/\s+/gu, ' '));
    }
  }
  return texts;
}

export function lostCommentsIn(sides, sourceFile) {
  const [kept, dropped] = sides.map(({ roots, range }) => commentsIn(roots, sourceFile, range));
  return [...dropped].some((text) => !kept.has(text));
}

export function lostComments(units, sourceFile) {
  const sides = units.map((unit) => ({
    roots: [unit.body],
    range: { pos: unit.body.pos, end: unit.body.end },
  }));
  return lostCommentsIn(sides, sourceFile);
}
