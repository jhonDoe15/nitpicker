import type {
  ColumnFinding,
  ColumnLocation,
  ColumnSettings,
  UnitName,
  UnitSpec,
} from '../typed/report-types.mts';

const DEFAULT_TAB_WIDTH = 8;
const LINE_BREAK = /\r\n|\r|\n/u;
const BYTE_ORDER_MARK = '\uFEFF';
const LAST_ASCII_CODE_POINT = 127;

function codeUnits(text: string): string[] {
  return Array.from({ length: text.length }, (_, index) => text.charAt(index));
}

function nextTabStop(position: number, tabWidth: number): number {
  return (Math.floor(position / tabWidth) + 1) * tabWidth;
}

function utf16Offset(lineText: string, codePoints: number): number {
  let offset = 0;
  let counted = 0;
  for (const character of lineText) {
    if (counted >= codePoints) {
      break;
    }
    offset += character.length;
    counted += 1;
  }
  return offset + codePoints - counted;
}

function tabStopsIndex(characters: readonly string[], column: number, tabWidth: number): number {
  let position = 0;
  let index = 0;
  for (const character of characters) {
    if (position >= column - 1) {
      break;
    }
    position = character === '\t' ? nextTabStop(position, tabWidth) : position + 1;
    index += 1;
  }
  return index + Math.max(0, column - 1 - position);
}

function isAscii(text: string): boolean {
  return Array.from(text).every(
    (character) => (character.codePointAt(0) ?? 0) <= LAST_ASCII_CODE_POINT,
  );
}

type Conversion = (
  lineText: string | undefined,
  column: number,
  tabWidth: number,
) => number | undefined;

const CONVERSIONS: Readonly<Record<UnitName, Conversion>> = {
  'ascii-only': (lineText, column) =>
    lineText !== undefined && isAscii(lineText) ? column : undefined,
  'code-points': (lineText, column) => utf16Offset(lineText ?? '', column - 1) + 1,
  'tab-stops': (lineText, column, tabWidth) =>
    tabStopsIndex(codeUnits(lineText ?? ''), column, tabWidth) + 1,
  'checkstyle-tab-stops': (lineText, column, tabWidth) =>
    utf16Offset(lineText ?? '', tabStopsIndex(codeUnits(lineText ?? ''), column, tabWidth)) + 1,
};

function specOf(spec: UnitName | UnitSpec): UnitSpec {
  return typeof spec === 'string' ? { unit: spec } : spec;
}

export function utf16Column(
  lineText: string | undefined,
  column: number,
  spec: UnitName | UnitSpec,
): number | undefined {
  const { unit, tabWidth = DEFAULT_TAB_WIDTH } = specOf(spec);
  return CONVERSIONS[unit](lineText, column, tabWidth);
}

function sourceLines(text: string): string[] {
  return (text.startsWith(BYTE_ORDER_MARK) ? text.slice(1) : text).split(LINE_BREAK);
}

function unitOf(units: ColumnSettings['units'], tool: string): UnitSpec | undefined {
  if (!Object.hasOwn(units, tool)) {
    return undefined;
  }
  const spec = units[tool];
  return spec === undefined ? undefined : specOf(spec);
}

function convertedLocation(
  { column, ...location }: ColumnLocation & { readonly column: number },
  lineText: string | undefined,
  spec: UnitSpec,
): ColumnLocation {
  const converted =
    lineText === undefined && spec.unit !== 'ascii-only'
      ? column
      : utf16Column(lineText, column, spec);
  return converted === undefined ? location : { ...location, column: converted };
}

export function withUtf16Columns<Finding extends ColumnFinding>(
  findings: readonly Finding[],
  { units, readSource }: ColumnSettings,
): Finding[] {
  const lines = new Map<string, string[] | undefined>();
  function lineOf(file: string, line: number | undefined): string | undefined {
    if (!lines.has(file)) {
      const text = readSource(file);
      lines.set(file, text === undefined ? undefined : sourceLines(text));
    }
    return line === undefined ? undefined : lines.get(file)?.[line - 1];
  }
  return findings.map((finding) => {
    const spec = unitOf(units, finding.tool);
    const location = finding.location;
    if (spec === undefined || location?.column === undefined) {
      return finding;
    }
    const lineText = lineOf(finding.path, location.line);
    const located = { ...location, column: location.column };
    return { ...finding, location: convertedLocation(located, lineText, spec) };
  });
}
