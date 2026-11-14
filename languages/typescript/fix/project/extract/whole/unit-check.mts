import type TypeScript from 'typescript';
import { typescriptApi } from '../../../../adapters/typed/typescript-program.mts';
import {
  bodyOf,
  eachSide,
  type Both,
  type Region,
  type UnitNode,
} from '../typed/extract-types.mts';
import { normalizedText } from '../syntax.mts';

const ts = typescriptApi();

const UNIT_TESTS = [
  ts.isFunctionDeclaration,
  ts.isMethodDeclaration,
  ts.isArrowFunction,
  ts.isFunctionExpression,
];

export function isAsync(unit: UnitNode): boolean {
  return (ts.getModifiers(unit) ?? []).some(({ kind }) => kind === ts.SyntaxKind.AsyncKeyword);
}

function parameterProblem(parameter: TypeScript.ParameterDeclaration): string | undefined {
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

function kindProblem([a, b]: Both<UnitNode>): string | undefined {
  if (!UNIT_TESTS.some((test) => test(a)) || a.kind !== b.kind) {
    return 'the copies are not both functions or methods of one kind';
  }
  if (a.body === undefined || b.body === undefined || ts.isBlock(a.body) !== ts.isBlock(b.body)) {
    return 'the copies have different kinds of body';
  }
  return [a, b].some(
    (unit) => unit.asteriskToken !== undefined || unit.typeParameters !== undefined,
  )
    ? 'a copy is a generator or has type parameters'
    : undefined;
}

function signatureProblem(
  [a, b]: Both<UnitNode>,
  sourceFile: TypeScript.SourceFile,
): string | undefined {
  if (isAsync(a) !== isAsync(b) || a.parameters.length !== b.parameters.length) {
    return 'the copies differ in async or in their parameters';
  }
  const returns = [a, b].map(({ type }) => type && normalizedText(type, sourceFile));
  return returns[0] === returns[1] ? undefined : 'the copies declare different return types';
}

export function unitProblem(
  units: Both<UnitNode>,
  sourceFile: TypeScript.SourceFile,
): string | undefined {
  const parameters = units.flatMap((unit) => [...unit.parameters]);
  return (
    kindProblem(units) ??
    signatureProblem(units, sourceFile) ??
    parameters.map(parameterProblem).find((found) => found !== undefined)
  );
}

function tokensUnder(root: TypeScript.Node, sourceFile: TypeScript.SourceFile): TypeScript.Node[] {
  const found: TypeScript.Node[] = [];
  const pending = [root];
  for (const node of pending) {
    found.push(node);
    pending.push(...node.getChildren(sourceFile));
  }
  return found;
}

function commentsIn(
  roots: readonly TypeScript.Node[],
  sourceFile: TypeScript.SourceFile,
  range: Region,
): Set<string> {
  const texts = new Set<string>();
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

export function lostCommentsIn(
  sides: Both<{ readonly roots: readonly TypeScript.Node[]; readonly range: Region }>,
  sourceFile: TypeScript.SourceFile,
): boolean {
  const [kept, dropped] = eachSide(sides, ({ roots, range }) =>
    commentsIn(roots, sourceFile, range),
  );
  return [...dropped].some((text) => !kept.has(text));
}

export function lostComments(units: Both<UnitNode>, sourceFile: TypeScript.SourceFile): boolean {
  const sides = eachSide(units, (unit) => ({
    roots: [bodyOf(unit)],
    range: { pos: bodyOf(unit).pos, end: bodyOf(unit).end },
  }));
  return lostCommentsIn(sides, sourceFile);
}
