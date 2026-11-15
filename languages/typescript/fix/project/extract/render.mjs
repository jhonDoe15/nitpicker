import { chainOf } from '../../../../../shared/traversal.mjs';
import { ts } from '../../../typescript-api/typescript-api.mjs';
import { nameHoles as sharedNameHoles } from '../../../../../shared/fix/recipes/extract/names.mjs';
import { descendants } from './syntax.mjs';

export function identifierTexts(sourceFile) {
  return new Set(
    descendants(sourceFile)
      .filter((node) => ts.isIdentifier(node) || ts.isPrivateIdentifier(node))
      .map(({ text }) => text),
  );
}

export function topLevelStatement(node) {
  return chainOf(node, ({ parent }) => (ts.isSourceFile(parent) ? undefined : parent)).at(-1);
}

function flowName(node) {
  const parent = node.parent;
  const named = ts.isVariableDeclaration(parent) || ts.isPropertyAssignment(parent);
  if (named && ts.isIdentifier(parent.name)) {
    return parent.name.text;
  }
  return ts.isIdentifier(node) ? node.text : undefined;
}

export function nameHoles(holes, taken) {
  return sharedNameHoles(holes, taken, (hole) => flowName(hole.occurrences[0].a));
}

const TYPE_NAMES = [
  'T',
  'U',
  'V',
  'W',
  'X',
  'Y',
  'Z',
  ...Array.from({ length: 20 }, (_, index) => `T${index + 1}`),
];

export function nameTypeHoles(holes, taken) {
  const free = TYPE_NAMES.filter((name) => !taken.has(name));
  return holes.length > free.length
    ? undefined
    : holes.map((hole, index) => ({ ...hole, name: free[index] }));
}

export function typeArgumentText(hole, side, sourceFile) {
  return hole.occurrences[0][side === 0 ? 'a' : 'b'].getText(sourceFile).replaceAll(/\s+/gu, ' ');
}

export function replacedText(range, holes, sourceFile) {
  const replacements = holes.flatMap((hole) =>
    hole.occurrences
      .filter(({ a }) => a.getStart(sourceFile) >= range.start && a.end <= range.end)
      .map(({ a }) => ({
        start: a.getStart(sourceFile) - range.start,
        end: a.end - range.start,
        text: hole.kind === 'thunk' ? `${hole.name}()` : hole.name,
      })),
  );
  return replacements
    .toSorted((left, right) => right.start - left.start)
    .reduce(
      (text, { start, end, text: name }) => text.slice(0, start) + name + text.slice(end),
      sourceFile.text.slice(range.start, range.end),
    );
}

function typeString(checker, type) {
  const flags = ts.TypeFormatFlags.NoTruncation;
  return checker.typeToString(checker.getBaseTypeOfLiteralType(type), undefined, flags);
}

export function symbolTypeString(checker, symbol) {
  return typeString(checker, checker.getTypeOfSymbol(symbol));
}

function sideTypes(hole, checker) {
  return ['a', 'b'].map((side) => {
    const node = hole.occurrences[0][side];
    return hole.kind === 'parameter'
      ? symbolTypeString(checker, checker.getSymbolAtLocation(node))
      : typeString(checker, checker.getTypeAtLocation(node));
  });
}

export function holeParameterText(hole, checker, typed) {
  if (!typed) {
    return hole.name;
  }
  const types = [...new Set(sideTypes(hole, checker))];
  const joined = types.join(' | ');
  const type =
    hole.kind === 'thunk' ? `() => ${types.length > 1 ? `(${joined})` : joined}` : joined;
  return `${hole.name}: ${type}`;
}

export function holeArgumentText(hole, side, sourceFile) {
  const node = hole.occurrences[0][side === 0 ? 'a' : 'b'];
  const text = node.getText(sourceFile);
  if (hole.kind !== 'thunk') {
    return text;
  }
  return ts.isObjectLiteralExpression(node) ? `() => (${text})` : `() => ${text}`;
}
