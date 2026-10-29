const TAB_WIDTH = 8;
const LINE_BREAK = /\r\n|\r|\n/u;
const LAST_ASCII_CODE_POINT = 127;

const ADVANCE = {
  'code-points': (position) => position + 1,
  'tab-expanded': (position, character) =>
    character === '\t'
      ? (Math.floor(position / TAB_WIDTH) + 1) * TAB_WIDTH
      : position + character.length,
};

function isAscii(text) {
  return [...text].every((character) => character.codePointAt(0) <= LAST_ASCII_CODE_POINT);
}

export function utf16Column(lineText, column, unit) {
  if (unit === 'ascii-only') {
    return isAscii(lineText) ? column : undefined;
  }
  const advance = ADVANCE[unit];
  let position = 0;
  let codeUnits = 0;
  for (const character of lineText) {
    if (position >= column - 1) {
      break;
    }
    position = advance(position, character);
    codeUnits += character.length;
  }
  return codeUnits + Math.max(0, column - 1 - position) + 1;
}

function convertedLocation({ column, ...location }, lineText, unit) {
  const converted = utf16Column(lineText, column, unit);
  return converted === undefined ? location : { ...location, column: converted };
}

export function withUtf16Columns(findings, { units, readSource }) {
  const lines = new Map();
  function lineOf(file, line) {
    if (!lines.has(file)) {
      lines.set(file, readSource(file)?.split(LINE_BREAK));
    }
    return lines.get(file)?.[line - 1];
  }
  return findings.map((finding) => {
    const unit = units[finding.tool];
    const lineText =
      unit === undefined || finding.location?.column === undefined
        ? undefined
        : lineOf(finding.path, finding.location.line);
    return lineText === undefined
      ? finding
      : { ...finding, location: convertedLocation(finding.location, lineText, unit) };
  });
}
