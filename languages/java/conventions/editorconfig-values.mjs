const SECTION = /^\[(.+)\]$/;
const PAIR = /^([^=:\s][^=:]*?)\s*[=:]\s*(.*?)\s*$/;
const COMMENT = /^\s*[#;]/;
const EXTENSIONS = /^\*\.(?:\{([^}]*)\}|(\w+))$/;
const WILDCARD_RULE = /^\s*WildcardImport:\s*(?:#.*)?$/;
const ACTIVE = /^\s*active:\s*(true|false)\b/;

function pairOf(line) {
  return PAIR.exec(line.trim()) ?? undefined;
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
      entries.push([pair[1].toLowerCase(), pair[2].toLowerCase()]);
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
