const SECTION = /^\[(.+)\]$/;
const COMMENT = /^\s*[#;]/;
const EXTENSIONS = /^\*\.(?:\{([^}]*)\}|(\w+))$/;
const WILDCARD_RULE = /^\s*WildcardImport:\s*(?:#.*)?$/;
const ACTIVE = /^\s*active:\s*(true|false)\b/;

function pairOf(line) {
  const text = line.trim();
  const separator = text.search(/[=:]/);
  const key = separator > 0 ? text.slice(0, separator).trimEnd() : '';
  return key === '' ? undefined : [key, text.slice(separator + 1).trim()];
}

function coversKotlin(glob) {
  const match = EXTENSIONS.exec(glob);
  return glob === '*' || (match !== null && (match[1] ?? match[2]).split(',').includes('kt'));
}

export function kotlinEditorconfigValues(text) {
  const entries = [];
  let applies = false;
  for (const line of text.split(/\r?\n/)) {
    const section = SECTION.exec(line.trim());
    applies = section === null ? applies : coversKotlin(section[1]);
    const pair = section === null && applies && !COMMENT.test(line) ? pairOf(line) : undefined;
    if (pair !== undefined) {
      entries.push([pair[0].toLowerCase(), pair[1].toLowerCase()]);
    }
  }
  return Object.fromEntries(entries);
}

function indentOfLine(line) {
  return line.length - line.trimStart().length;
}

function ruleBody(lines) {
  const start = lines.findIndex((line) => WILDCARD_RULE.test(line));
  if (start === -1) {
    return [];
  }
  const indent = indentOfLine(lines[start]);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.trim() !== '' && indentOfLine(line) <= indent);
  return end === -1 ? rest : rest.slice(0, end);
}

export function detektWildcardActive(text) {
  const active = ruleBody(text.split(/\r?\n/))
    .map((line) => ACTIVE.exec(line))
    .find((match) => match !== null);
  return active === undefined ? undefined : active[1] === 'true';
}

const MAX_LENGTH = /^\s*maxLineLength:\s*(\d+)\b/;
const MAX_LINE_LENGTH_RULE = /^\s*MaxLineLength:\s*(?:#.*)?$/;

export function detektMaxLineLength(text) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => MAX_LINE_LENGTH_RULE.test(line));
  if (start === -1) {
    return undefined;
  }
  const indent = indentOfLine(lines[start]);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.trim() !== '' && indentOfLine(line) <= indent);
  const body = end === -1 ? rest : rest.slice(0, end);
  return body.map((line) => MAX_LENGTH.exec(line)).find((match) => match !== null)?.[1];
}
