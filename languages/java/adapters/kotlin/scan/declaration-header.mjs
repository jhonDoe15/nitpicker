import { closingIndex } from './kotlin-source.mjs';

export const UNUSED_PARAMETER_RULE = 'detekt.style.UnusedParameter';

const PLAIN_ANNOTATIONS = new Set([
  'Deprecated',
  'Suppress',
  'SuppressWarnings',
  'Throws',
  'JvmStatic',
  'JvmOverloads',
  'JvmName',
  'OptIn',
  'SafeVarargs',
  'Nullable',
  'NonNull',
  'NotNull',
]);
const MODIFIERS =
  'public|private|protected|internal|open|final|abstract|sealed|data|enum|annotation|inner|value|fun|companion|override|suspend|inline|operator|infix|tailrec|external|expect|actual|const|lateinit|vararg';
const ARGUMENTS = String.raw`\s*\((?:[^()]|\((?:[^()]|\([^()]*\))*\))*\)`;
const ANNOTATION_TEXT = new RegExp(String.raw`@\[?[\w.:]+\]?(?:${ARGUMENTS})?`, 'g');
const DECLARATION_TAIL = new RegExp(
  String.raw`(?:(?:@\[?[\w.:]+\]?(?:${ARGUMENTS})?|(?<![\w.])(?:${MODIFIERS})\b)\s+)*$`,
);
const MODIFIER_NAME = new RegExp(String.raw`(?<![\w.@])(?:${MODIFIERS})\b`, 'g');
const ANNOTATION_NAME = /@\[?(?:\w+:)?([\w.]+)/g;
const FUNCTION = /(?<![\w.])fun\s/g;
const HEADER_WINDOW = 800;

export function leadingDeclaration(code, index) {
  const header = code.slice(Math.max(0, index - HEADER_WINDOW), index);
  const tail = header.slice(DECLARATION_TAIL.exec(header).index);
  return {
    annotations: [...tail.matchAll(ANNOTATION_NAME)].map(([, name]) => name.split('.').at(-1)),
    modifiers: [...tail.replaceAll(ANNOTATION_TEXT, ' ').matchAll(MODIFIER_NAME)].map(
      ([word]) => word,
    ),
  };
}

function functionAround(scanned, line) {
  const from = scanned.lineStarts[line - 1];
  const to = scanned.lineStarts[line] ?? scanned.code.length;
  return [...scanned.code.matchAll(FUNCTION)]
    .filter(({ index }) => {
      const open = scanned.code.indexOf('(', index);
      return open !== -1 && open < to && closingIndex(scanned.code, open) >= from;
    })
    .at(-1);
}

export function hasCallbackAnnotation(scanned, line) {
  const declaration = functionAround(scanned, line);
  return (
    declaration !== undefined &&
    leadingDeclaration(scanned.code, declaration.index).annotations.some(
      (name) => !PLAIN_ANNOTATIONS.has(name),
    )
  );
}
