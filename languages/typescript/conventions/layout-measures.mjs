const MODULE_SPECIFIER =
  /^\s*(?:import|export)\b[^'"`]*?(['"])|^[^'"`]*\b(?:require|import)\(\s*(['"])/;
const OPENS_BLOCK = /\{\s*(?:\/\/.*)?$/;
const COMMENT_LINE = /^\s*(?:\/\/|\/\*|\*)/;
const PARENTHESIZED_PARAMETER = /\(\s*[A-Za-z_$][\w$]*\s*\)\s*=>/g;
const BARE_PARAMETER =
  /(?:^|[\s,=:([{]|\?\?|&&|\|\|)(?<!\)\s*:\s*|\bis\s+)(?:async\s+)?[A-Za-z_$][\w$]*\s*=>/gm;
const OPENING_BRACE =
  /^\s*(?:(?:import|export)\s+(?:type\s+)?|(?:const|let|var)\s+)\{(\s?)[^}\s]/gm;
const MIN_STATEMENT_LINES = 10;
const MIN_TERMINATED_SHARE = 0.05;
const QUOTES = ['"', "'", '`'];

export function quoteStyle(text) {
  const quotes = codeLines(text).map((line) => {
    const match = MODULE_SPECIFIER.exec(line);
    return match?.[1] ?? match?.[2];
  });
  return majority(quotes, { "'": 'single', '"': 'double' });
}

export function semicolonStyle(text) {
  const lines = codeLines(text).map(codeEnding);
  const terminated = lines.filter((line) => line.endsWith(';')).length;
  if (terminated >= 3 && terminated >= lines.length * MIN_TERMINATED_SHARE) {
    return 'always';
  }
  return terminated === 0 && lines.length >= MIN_STATEMENT_LINES ? 'never' : undefined;
}

export function codeEnding(line) {
  const comment = [...line.matchAll(/\s\/\//g)].find((match) =>
    QUOTES.every((quote) => line.slice(0, match.index).split(quote).length % 2 === 1),
  );
  return line.slice(0, comment?.index).trimEnd();
}

export function indentationStyle(text) {
  const lines = codeLines(text);
  const steps = [];
  for (const [index, line] of lines.slice(1).entries()) {
    const previous = lines[index];
    if (OPENS_BLOCK.test(previous) && !/^\s*[?:]/.test(previous)) {
      steps.push(line.startsWith('\t') ? 'tab' : String(indentOf(line) - indentOf(previous)));
    }
  }
  return majority(steps, { 2: '2', 4: '4', tab: 'tab' });
}

export function arrowParentheses(text) {
  const code = codeLines(text).join('\n');
  const parenthesized = code.match(PARENTHESIZED_PARAMETER)?.length ?? 0;
  const bare = code.match(BARE_PARAMETER)?.length ?? 0;
  return winner({ always: parenthesized, avoid: bare });
}

export function bracketSpacing(text) {
  const spaces = [...text.matchAll(OPENING_BRACE)].map((match) => match[1]);
  return majority(spaces, { ' ': 'spaced', '': 'tight' });
}

export function lineEndings(text) {
  const crlf = text.split('\r\n').length - 1;
  return winner({ crlf, lf: text.split('\n').length - 1 - crlf });
}

export function codeLines(text) {
  const lines = [];
  let inTemplate = false;
  for (const line of text.split(/\r?\n/)) {
    if (!inTemplate && line.trim().length > 0 && !COMMENT_LINE.test(line)) {
      lines.push(line);
    }
    if ((line.match(/(?<!\\)`/g)?.length ?? 0) % 2 === 1) {
      inTemplate = !inTemplate;
    }
  }
  return lines;
}

function majority(values, labels) {
  const counts = {};
  for (const value of values) {
    if (value in labels) {
      counts[labels[value]] = (counts[labels[value]] ?? 0) + 1;
    }
  }
  return winner(counts);
}

export function winner(counts) {
  const ranked = Object.entries(counts)
    .filter(([, count]) => count > 0)
    .sort(([, left], [, right]) => right - left);
  if (ranked.length === 0 || ranked[1]?.[1] === ranked[0][1]) {
    return undefined;
  }
  return ranked[0][0];
}

function indentOf(line) {
  return line.length - line.trimStart().length;
}
