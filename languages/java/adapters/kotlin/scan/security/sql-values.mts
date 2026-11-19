import { escapeRegExp } from '../typed/typed-scan.mts';
import { DYNAMIC } from '../../../../../../shared/rules/security/sql-text.mjs';
import { literalAt, splitArguments } from '../kotlin-source.mts';
import type { Literal, Scanned } from '../typed/scan-shapes.mts';
import type { KotlinDeclarations, Span } from '../typed/rule-shapes.mts';
import type {
  ClassifiedPiece,
  DeclaredNames,
  InertContext,
  MemberContext,
  SqlPiece,
} from './sql-types.mts';

export { templatePieces } from './sql-templates.mts';

const NUMBER = /^-?\d[\d_]*(?:\.\d+)?[LlFfUu]?$/;
const CONSTANT = /^(?:[A-Za-z_]\w*\.)*[A-Z][A-Z0-9_]*$/;
const MEASURE = /\.\s*(?:size|length|ordinal|lastIndex|count\s*\(\s*\))$/;
const ARITHMETIC = /^[A-Za-z_]\w*\s*[-+*/%]\s*\d+$/;
const PLAIN_LITERAL = /^"([^"$\\]*)"$|^'(?:\\.|[^'\\])'$/;
const PLACEHOLDER_TEXT = /^[?,\s()]+$/;
const SEPARATOR = String.raw`(?:\(\s*(?:"[^"$\\]*"\s*)?\)\s*)?`;
const PLACEHOLDER_FORMS = [
  new RegExp(String.raw`\.\s*joinToString\s*${SEPARATOR}\{(?:[\w\s,]+->)?\s*"([^"$\\]*)"\s*\}$`),
  new RegExp(
    String.raw`^List\s*\([^()]*\)\s*\{\s*"([^"$\\]*)"\s*\}\s*\.\s*joinToString\s*${SEPARATOR}$`,
  ),
  /^"([^"$\\]*)"\s*\.\s*repeat\s*\([^()]*\)(?:\s*\.\s*(?:dropLast|removeSuffix|trimEnd)\s*\([^()]*\))*$/,
];
const JOINED = /^([A-Za-z_]\w*)\s*\.\s*joinToString\s*\(\s*"[^"$\\]*"\s*\)$/;
const LITERAL_LIST = /^(?:mutableListOf|arrayListOf)\s*(?:<\s*String\s*>\s*)?\(/;
const LIST_USE = /^\s*(?:\.\s*(?:add\s*\(|joinToString\b|isEmpty\b|isNotEmpty\b|size\b)|\+=)/;
const CONDITIONAL_LITERAL = /^if\s*\(.*\)\s*"\s*"\s*else\s*"\s*"$/;
const INERT_TYPES = new Set([
  'Int',
  'Long',
  'Short',
  'Byte',
  'Double',
  'Float',
  'Boolean',
  'UInt',
  'ULong',
  'BigDecimal',
  'BigInteger',
  'UUID',
  'LocalDate',
  'LocalDateTime',
  'LocalTime',
  'Instant',
  'OffsetDateTime',
  'ZonedDateTime',
]);
const ENUM = /\benum\s+class\s+([A-Z]\w*)/g;
const INITIALIZER_MARK = /[()[\]{}\n;]/g;
const PROPERTY = /\b(?:val|var)\s+([A-Za-z_]\w*)\s*:\s*([A-Za-z_][\w.]*)/g;

export function kotlinDeclarations(scannedFiles: Scanned[]): KotlinDeclarations {
  const enums = new Set<string>();
  const properties = new Map<string, string[]>();
  for (const { code } of scannedFiles) {
    for (const [, name = ''] of code.matchAll(ENUM)) {
      enums.add(name);
    }
    for (const [, name = '', type = ''] of code.matchAll(PROPERTY)) {
      properties.set(name, [...(properties.get(name) ?? []), simpleName(type)]);
    }
  }
  return { enums, properties };
}

function simpleName(type: string): string {
  return type.split('.').at(-1) ?? type;
}

function isInertType(type: string, declarations: KotlinDeclarations): boolean {
  return INERT_TYPES.has(type) || declarations.enums.has(type);
}

function placeholders(expression: string): boolean {
  return PLACEHOLDER_FORMS.some((form) => PLACEHOLDER_TEXT.test(form.exec(expression)?.[1] ?? ''));
}

function initializerEnd(code: string, offset: number): number {
  let depth = 0;
  for (const { index = 0, 0: mark } of code.slice(offset).matchAll(INITIALIZER_MARK)) {
    if ('([{'.includes(mark)) {
      depth += 1;
    } else if (')]}'.includes(mark) && depth > 0) {
      depth -= 1;
    } else if (depth === 0) {
      return offset + index;
    }
  }
  return code.length;
}

function initializerAt(
  scanned: Scanned,
  offset: number,
): { code: string; source: string; literal: Literal | undefined } {
  const end = initializerEnd(scanned.code, offset);
  return {
    code: scanned.code.slice(offset, end).trim(),
    source: scanned.source.slice(offset, end).trim(),
    literal: literalAt(scanned, offset),
  };
}

function isInertValue(expression: string): boolean {
  return (
    NUMBER.test(expression) ||
    PLAIN_LITERAL.test(expression) ||
    CONSTANT.test(expression) ||
    MEASURE.test(expression) ||
    ARITHMETIC.test(expression) ||
    placeholders(expression)
  );
}

function isInertInitializer(scanned: Scanned, offset: number): boolean {
  const initializer = initializerAt(scanned, offset);
  const { literal } = initializer;
  if (literal !== undefined && initializer.code.length === literal.end - literal.start) {
    return !literal.template;
  }
  if (CONDITIONAL_LITERAL.test(initializer.code.replaceAll(/"[^"]*"/g, '""'))) {
    return (initializer.source.match(/"[^"]*"/g) ?? []).every((text) => !text.includes('$'));
  }
  return isInertValue(initializer.source);
}

export function isConstantExpression(expression: string, scanned: Scanned): boolean {
  if (NUMBER.test(expression) || PLAIN_LITERAL.test(expression) || CONSTANT.test(expression)) {
    return true;
  }
  if (!/^[A-Za-z_]\w*$/.test(expression)) {
    return false;
  }
  const constants = [
    ...scanned.code.matchAll(
      new RegExp(
        String.raw`\bconst\s+val\s+${escapeRegExp(expression)}\s*(?::\s*[\w.]+\s*)?=(?!=)\s*`,
        'g',
      ),
    ),
  ];
  return (
    constants.length > 0 &&
    constants.length === nameDeclarations(scanned, expression).assigned.length &&
    constants.every((match) => isInertInitializer(scanned, match.index + match[0].length))
  );
}

function nameDeclarations(scanned: Scanned, name: string): DeclaredNames {
  const typed = [
    ...scanned.code.matchAll(
      new RegExp(String.raw`(?<![\w.])${escapeRegExp(name)}\s*:\s*([A-Za-z_][\w.]*)`, 'g'),
    ),
  ];
  const assigned = [
    ...scanned.code.matchAll(
      new RegExp(
        String.raw`\b(?:val|var)\s+${escapeRegExp(name)}\s*(?::\s*[\w.<>?]+\s*)?=(?!=)\s*`,
        'g',
      ),
    ),
  ];
  return { typed: typed.map((match) => simpleName(match[1] ?? '')), assigned };
}

function isInertName(name: string, scanned: Scanned, context: InertContext): boolean {
  const { typed, assigned } = nameDeclarations(scanned, name);
  if (typed.length > 0) {
    return typed.every((type) => isInertType(type, context.declarations));
  }
  return (
    assigned.length > 0 &&
    assigned.every((match) => isInertInitializer(scanned, match.index + match[0].length))
  );
}

function isLiteralArgument(scanned: Scanned, part: Span): boolean {
  const text = scanned.code.slice(part.start, part.end);
  const offset = part.start + text.length - text.trimStart().length;
  const literal = literalAt(scanned, offset);
  return literal !== undefined && !literal.template && literal.end - offset === text.trim().length;
}

function appendsLiteral(scanned: Scanned, offset: number, after: string): boolean {
  const appended = /^\s*\+=\s*/.exec(after);
  if (appended === null) {
    return true;
  }
  const start = offset + appended[0].length;
  const newline = scanned.code.indexOf('\n', start);
  return isLiteralArgument(scanned, { start, end: newline === -1 ? scanned.code.length : newline });
}

function isLiteralList(name: string, scanned: Scanned): boolean {
  const uses = [
    ...scanned.code.matchAll(new RegExp(String.raw`(?<![\w.])${escapeRegExp(name)}\b`, 'g')),
  ];
  const declared = new RegExp(String.raw`\b(?:val|var)\s+$`);
  return uses.every(({ index }) => {
    const after = scanned.code.slice(index + name.length);
    if (declared.test(scanned.code.slice(0, index))) {
      const open = index + name.length + after.indexOf('(');
      const initializer = /^\s*=\s*(.*)/.exec(after)?.[1] ?? '';
      return (
        LITERAL_LIST.test(initializer) &&
        splitArguments(scanned.code, open).parts.every((part) => isLiteralArgument(scanned, part))
      );
    }
    if (!LIST_USE.test(after)) {
      return false;
    }
    const call = /^\s*\.\s*add\s*\(/.exec(after);
    if (call === null) {
      return appendsLiteral(scanned, index + name.length, after);
    }
    const { parts } = splitArguments(scanned.code, index + name.length + call[0].length - 1);
    const [only] = parts;
    return parts.length === 1 && only !== undefined && isLiteralArgument(scanned, only);
  });
}

function isInertMember(expression: string, context: MemberContext): boolean {
  const [base, ...members] = expression.split(/\s*\??\.\s*/);
  const property = members.at(-1);
  const types = context.declarations.properties.get(property ?? '') ?? [];
  const baseTypes = nameDeclarations(context.scanned, base ?? '').typed;
  return (
    (baseTypes.length > 0 && baseTypes.every((type) => context.declarations.enums.has(type))) ||
    (types.length > 0 && types.every((type) => isInertType(type, context.declarations)))
  );
}

function isInertExpression(expression: string, scanned: Scanned, context: InertContext): boolean {
  const joined = JOINED.exec(expression);
  if (isInertValue(expression)) {
    return true;
  }
  if (joined !== null) {
    return isLiteralList(joined[1] ?? '', scanned);
  }
  if (/^[A-Za-z_]\w*$/.test(expression)) {
    return isInertName(expression, scanned, context);
  }
  return (
    /^[A-Za-z_]\w*(?:\s*\??\.\s*[A-Za-z_]\w*)+$/.test(expression) &&
    isInertMember(expression, { ...context, scanned })
  );
}

export function classifiedPieces(
  pieces: SqlPiece[],
  scanned: Scanned,
  context: InertContext,
): ClassifiedPiece[] {
  return pieces.map((piece): ClassifiedPiece => {
    if ('text' in piece) {
      return piece;
    }
    if (!('expression' in piece)) {
      return piece;
    }
    const literal = PLAIN_LITERAL.exec(piece.expression);
    if (literal !== null) {
      return { text: literal[1] ?? DYNAMIC };
    }
    return isInertExpression(piece.expression, scanned, context)
      ? { text: DYNAMIC }
      : { runtime: true };
  });
}
