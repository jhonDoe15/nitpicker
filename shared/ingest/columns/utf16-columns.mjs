const DEFAULT_TAB_WIDTH = 8;
const LINE_BREAK = /\r\n|\r|\n/u;
const BYTE_ORDER_MARK = '\uFEFF';
const LAST_ASCII_CODE_POINT = 127;

function nextTabStop(position, tabWidth) {
  return (Math.floor(position / tabWidth) + 1) * tabWidth;
}

function utf16Offset(lineText, codePoints) {
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

function tabStopsIndex(characters, column, tabWidth) {
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

function isAscii(text) {
  return [...text].every((character) => character.codePointAt(0) <= LAST_ASCII_CODE_POINT);
}

const CONVERSIONS = {
  'ascii-only': (lineText, column) =>
    lineText !== undefined && isAscii(lineText) ? column : undefined,
  'code-points': (lineText, column) => utf16Offset(lineText, column - 1) + 1,
  'tab-stops': (lineText, column, tabWidth) =>
    tabStopsIndex(lineText.split(''), column, tabWidth) + 1,
  'checkstyle-tab-stops': (lineText, column, tabWidth) =>
    utf16Offset(lineText, tabStopsIndex(lineText.split(''), column, tabWidth)) + 1,
};

function specOf(spec) {
  return typeof spec === 'string' ? { unit: spec } : spec;
}

export function utf16Column(lineText, column, spec) {
  const { unit, tabWidth = DEFAULT_TAB_WIDTH } = specOf(spec);
  return CONVERSIONS[unit](lineText, column, tabWidth);
}

function sourceLines(text) {
  return (text.startsWith(BYTE_ORDER_MARK) ? text.slice(1) : text).split(LINE_BREAK);
}

function unitOf(units, tool) {
  if (!Object.hasOwn(units, tool)) {
    return undefined;
  }
  return specOf(units[tool]);
}

function convertedLocation({ column, ...location }, lineText, spec) {
  const converted =
    lineText === undefined && spec.unit !== 'ascii-only'
      ? column
      : utf16Column(lineText, column, spec);
  return converted === undefined ? location : { ...location, column: converted };
}

export function withUtf16Columns(findings, { units, readSource }) {
  const lines = new Map();
  function lineOf(file, line) {
    if (!lines.has(file)) {
      const text = readSource(file);
      lines.set(file, text === undefined ? undefined : sourceLines(text));
    }
    return lines.get(file)?.[line - 1];
  }
  return findings.map((finding) => {
    const spec = unitOf(units, finding.tool);
    if (spec === undefined || finding.location?.column === undefined) {
      return finding;
    }
    const lineText = lineOf(finding.path, finding.location.line);
    return { ...finding, location: convertedLocation(finding.location, lineText, spec) };
  });
}
