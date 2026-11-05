import {
  braceDepths,
  enclosingOpen,
  inImport,
  literalAt,
  parenDepths,
  splitArguments,
} from '../kotlin-source.mjs';

const UNQUOTED_RULE = 'UnquotedRegexValue';
const PLAIN_RULE = 'PlainTextRegex';

export const REGEX_MESSAGES = {
  [UNQUOTED_RULE]:
    'Escape the value before it goes into the pattern (`Regex("^/${Regex.escape(name)}/\\\\d+$")`, `Pattern.quote(name)` for `Pattern.compile`), match plain text with `contains`, `startsWith` or `split(value)`, or pass a value that is meant as a whole pattern to `Regex(pattern)` on its own. A runtime value built into this regex unescaped changes the pattern when it holds a `.`, `|`, `$` or another metacharacter.',
  [PLAIN_RULE]:
    'Pass the text itself: `replace("\\r", "")`, `replaceFirst`, `split(",")` and `contains("x")` take plain text in Kotlin. This regex has no metacharacters, so compiling it only costs time and makes a `$` in the replacement a group reference.',
};

const CONSTRUCTOR =
  /(?<![\w.])(?:kotlin\.text\.)?Regex\s*\(|(?<![\w.])(?:java\.util\.regex\.)?Pattern\s*\.\s*compile\s*\(/g;
const CONVERSION = /\.\s*to(?:Regex|Pattern)\s*\(/g;
const PLAIN_USE = /\.\s*(?:replace|replaceFirst|split|contains)\s*\(/g;
const ESCAPED =
  /^(?:(?:kotlin\.text\.)?Regex\s*\.\s*escape|(?:java\.util\.regex\.)?Pattern\s*\.\s*quote)\s*\(/;
const CONSTANT = /^(?:[A-Z]\w*\.)*[A-Z][A-Z0-9_]*$/;
const PATTERN_SOURCE = /\.\s*pattern(?:\s*\(\s*\))?$/;
const ROOT_NAME = /^[A-Za-z_]\w*/;
const NON_TEXT_TYPES = 'Int|Long|Short|Byte|Double|Float|Boolean|Char|UInt|ULong';
const OWNER_BEFORE = /\bobject\b[^{};]*$/;
const TEMPLATE_ENTRY = /\$(?:\{|([A-Za-z_]\w*))/g;
const METACHARACTERS = /[\\^$.|?*+()[\]{}]/;
const ESCAPES = { t: '\t', b: '\b', n: '\n', r: '\r', "'": "'", '"': '"', '\\': '\\', $: '$' };

function trimmed(code, { start, end }) {
  const text = code.slice(start, end);
  const from = start + text.length - text.trimStart().length;
  return { start: from, end: from + text.trim().length };
}

function plusOperands(code, depths, part) {
  const level = depths[part.start];
  const pluses = [...code.slice(part.start, part.end).matchAll(/\+/g)]
    .map(({ index }) => part.start + index)
    .filter((index) => depths[index] === level);
  const starts = [part.start, ...pluses.map((index) => index + 1)];
  const ends = [...pluses, part.end];
  return starts.map((start, index) => trimmed(code, { start, end: ends[index] }));
}

function closingBrace(text, open) {
  let depth = 0;
  for (let index = open; index < text.length; index += 1) {
    depth += { '{': 1, '}': -1 }[text[index]] ?? 0;
    if (depth === 0) {
      return index;
    }
  }
  return text.length;
}

function isEscapedDollar(literal, index) {
  if (literal.raw) {
    return false;
  }
  const slashes = /\\*$/.exec(literal.text.slice(0, index))[0].length;
  return slashes % 2 === 1;
}

function templateEntries(literal) {
  return [...literal.text.matchAll(TEMPLATE_ENTRY)]
    .filter(({ index }) => !isEscapedDollar(literal, index))
    .map((match) => {
      if (match[1] !== undefined) {
        return { text: match[1], offset: literal.bodyStart + match.index };
      }
      const open = match.index + 1;
      const close = closingBrace(literal.text, open);
      return {
        text: literal.text.slice(open + 1, close).trim(),
        offset: literal.bodyStart + match.index,
      };
    });
}

function isOwnedDeclaration(code, index) {
  if (braceDepths(code)[index] === 0) {
    return true;
  }
  const open = enclosingOpen(code, index);
  return OWNER_BEFORE.test(code.slice(Math.max(0, open - 200), open));
}

function isConstantName(code, name) {
  const typed = new RegExp(String.raw`(?<![\w.])${name}\s*:\s*(?:${NON_TEXT_TYPES})\b`);
  if (typed.test(code)) {
    return true;
  }
  const declared = [...code.matchAll(new RegExp(String.raw`\b(const\s+)?val\s+${name}\b`, 'g'))];
  const parameter = new RegExp(
    String.raw`[(,]\s*(?:va[lr]\s+)?${name}\s*:|[{,]\s*${name}\s*(?:,[\w\s,]*)?->`,
  );
  return (
    declared.length > 0 &&
    !parameter.test(code) &&
    declared.every((match) => match[1] !== undefined || isOwnedDeclaration(code, match.index))
  );
}

function isRuntimeExpression(code, text) {
  if (ESCAPED.test(text) || CONSTANT.test(text) || PATTERN_SOURCE.test(text)) {
    return false;
  }
  if (/^-?\d/.test(text)) {
    return false;
  }
  const root = ROOT_NAME.exec(text)?.[0];
  return root !== undefined && !isConstantName(code, root);
}

function runtimeInOperand(scanned, operand, alone) {
  const literal = literalAt(scanned, operand.start);
  if (literal !== undefined && literal.end === operand.end) {
    return literal.template
      ? templateEntries(literal).find((entry) => isRuntimeExpression(scanned.code, entry.text))
      : undefined;
  }
  const text = scanned.source.slice(operand.start, operand.end).trim();
  if (alone || !isRuntimeExpression(scanned.code, text)) {
    return undefined;
  }
  return { text, offset: operand.start };
}

function unquotedIn(scanned, depths, part) {
  const operands = plusOperands(scanned.code, depths, trimmed(scanned.code, part));
  const alone = operands.length === 1;
  return operands.map((operand) => runtimeInOperand(scanned, operand, alone)).find(Boolean);
}

function receiverPart(scanned, dot) {
  const before = scanned.code.slice(0, dot).trimEnd();
  const end = before.length;
  const last = before.at(-1);
  if (last === '"') {
    const literal = scanned.literals.find((candidate) => candidate.end === end);
    return literal === undefined ? undefined : { start: literal.start, end };
  }
  if (last !== ')') {
    return undefined;
  }
  const depths = parenDepths(scanned.code);
  const level = depths[end - 1];
  let open = end - 1;
  while (open > 0 && !(scanned.code[open] === '(' && depths[open] === level)) {
    open -= 1;
  }
  const head = scanned.code.slice(0, open).trimEnd();
  return /[\w)\]]$/.test(head) ? undefined : { start: open + 1, end: end - 1 };
}

function regexSites(scanned) {
  const { code } = scanned;
  const constructed = [...code.matchAll(CONSTRUCTOR)]
    .filter(({ index }) => !inImport(code, index))
    .map((match) => {
      const open = match.index + match[0].length - 1;
      const { parts, close } = splitArguments(code, open);
      return { part: parts[0], count: parts.length, start: match.index, end: close + 1 };
    });
  const converted = [...code.matchAll(CONVERSION)].map((match) => {
    const open = match.index + match[0].length - 1;
    const { parts, close } = splitArguments(code, open);
    const part = receiverPart(scanned, match.index);
    return { part, count: parts.length + 1, start: part?.start ?? match.index, end: close + 1 };
  });
  return [...constructed, ...converted].filter(({ part }) => part !== undefined);
}

export function unquotedRegexValues(scanned) {
  const depths = parenDepths(scanned.code);
  return regexSites(scanned).flatMap((site) => {
    const runtime = unquotedIn(scanned, depths, site.part);
    return runtime === undefined
      ? []
      : [{ rule: UNQUOTED_RULE, offset: site.start, subject: runtime.text }];
  });
}

function decoded(literal) {
  if (literal.raw) {
    return literal.text;
  }
  return literal.text.replaceAll(/\\(u[0-9a-fA-F]{4}|.)/g, (_all, escape) =>
    escape.length === 5
      ? String.fromCodePoint(Number.parseInt(escape.slice(1), 16))
      : (ESCAPES[escape] ?? `\\${escape}`),
  );
}

function plainLiteral(scanned, part) {
  const operand = trimmed(scanned.code, part);
  const literal = literalAt(scanned, operand.start);
  if (literal === undefined || literal.template || literal.end !== operand.end) {
    return undefined;
  }
  const text = decoded(literal);
  return METACHARACTERS.test(text) || text === '' ? undefined : text;
}

export function plainTextRegexes(scanned) {
  const { code } = scanned;
  const sites = regexSites(scanned).filter((site) => site.count === 1);
  return [...code.matchAll(PLAIN_USE)].flatMap((match) => {
    const open = match.index + match[0].length - 1;
    const first = splitArguments(code, open).parts[0];
    if (first === undefined) {
      return [];
    }
    const argument = trimmed(code, first);
    const site = sites.find(({ start, end }) => start === argument.start && end === argument.end);
    const text = site === undefined ? undefined : plainLiteral(scanned, site.part);
    return text === undefined ? [] : [{ rule: PLAIN_RULE, offset: site.start, subject: text }];
  });
}
