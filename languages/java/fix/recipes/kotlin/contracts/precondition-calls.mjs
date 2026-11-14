import {
  closingIndex,
  literalAt,
  splitArguments,
} from '../../../../adapters/kotlin/scan/kotlin-source.mjs';

const SHADOWABLE = ['require', 'check', 'error', 'requireNotNull', 'checkNotNull'];

export function shadowsStandardCalls(code) {
  const declared = new RegExp(
    String.raw`\bfun\s+(?:[\w.<>?]+\.)?(?:${SHADOWABLE.join('|')})\s*[(<]`,
  );
  const imported = new RegExp(
    String.raw`^\s*import\s+[\w.]+\.(?:${SHADOWABLE.join('|')})\s*$`,
    'm',
  );
  return declared.test(code) || imported.test(code);
}

export function shadowsException(code, name) {
  const foreign = new RegExp(
    String.raw`^\s*import\s+(?!java\.lang\.|kotlin\.)[\w.]+\.${name}\b`,
    'm',
  );
  return new RegExp(String.raw`\b(?:class|typealias)\s+${name}\b`).test(code) || foreign.test(code);
}

export function throwCall(scanned, from, exceptionName) {
  const { code, source } = scanned;
  const head = new RegExp(String.raw`^throw\s+(?:java\.lang\.)?${exceptionName}\s*\(`, 'u').exec(
    code.slice(from),
  );
  if (head === null) {
    return undefined;
  }
  const open = from + head[0].length - 1;
  const { close, parts } = splitArguments(code, open);
  if (close >= code.length || parts.length > 1) {
    return undefined;
  }
  const [argument] = parts;
  const message = argument && source.slice(argument.start, argument.end).trim();
  const start =
    argument && argument.start + source.slice(argument.start, argument.end).search(/\S/u);
  const literal = argument && literalAt(scanned, start);
  if (argument !== undefined && (literal === undefined || literal.end !== start + message.length)) {
    return undefined;
  }
  return { end: close + 1, message };
}

function onlyBlanks(source, from, to) {
  return source.slice(from, to).replaceAll(/[;{}]/gu, '').trim() === '';
}

function startsStatement(code, lineStart, index) {
  const before = code.slice(lineStart, index).trim();
  return before === '' || before.endsWith('{') || before.endsWith(';');
}

function bodyOf(scanned, close) {
  const { code, source } = scanned;
  const body = /^\s*(\{\s*)?(?=throw\b)/u.exec(code.slice(close + 1));
  return body !== null && onlyBlanks(source, close + 1, close + 1 + body[0].length)
    ? body
    : undefined;
}

function tailEnd(scanned, thrown, braced) {
  const { code, source } = scanned;
  const tail = (braced ? /^(?:[ \t]*;)?\s*\}/u : /^(?:[ \t]*;)?/u).exec(code.slice(thrown.end));
  return tail !== null && onlyBlanks(source, thrown.end, thrown.end + tail[0].length)
    ? thrown.end + tail[0].length
    : undefined;
}

function guardAt(scanned, match, exceptionName) {
  const { code } = scanned;
  const lineStart = code.lastIndexOf('\n', match.index) + 1;
  const open = match.index + match[0].length - 1;
  const close = closingIndex(code, open);
  if (!startsStatement(code, lineStart, match.index) || close >= code.length) {
    return [];
  }
  const body = bodyOf(scanned, close);
  const thrown = body && throwCall(scanned, close + 1 + body[0].length, exceptionName);
  const end = thrown && tailEnd(scanned, thrown, body[1] !== undefined);
  return end === undefined || /^\s*else\b/u.test(code.slice(end))
    ? []
    : [{ start: match.index, end, condition: [open + 1, close], message: thrown.message }];
}

export function ifThrows(scanned, exceptionName) {
  return [...scanned.code.matchAll(/(?<![\w.])if\s*\(/gu)].flatMap((match) =>
    guardAt(scanned, match, exceptionName),
  );
}

const OPERATOR = /===|!==|==|!=|&&|\|\||<=|>=|[<>]|\?:|(?<!\w)!?(?:in|is|as)\b/gu;
const FLIPPED = { '==': '!=', '!=': '==', '===': '!==', '!==': '===' };
const CHAIN = /^[A-Za-z_]\w*(?:(?:\?\.|\.)[A-Za-z_]\w*)*(?:!!)?$/u;
const HIDDEN = '\u0000';

function topLevel(code) {
  let depth = 0;
  return [...code]
    .map((character) => {
      if ('([{'.includes(character)) {
        depth += 1;
        return HIDDEN;
      }
      if (')]}'.includes(character)) {
        depth -= 1;
        return HIDDEN;
      }
      return depth === 0 ? character : HIDDEN;
    })
    .join('');
}

export function negated(source, code) {
  const text = source.trim();
  const top = topLevel(code.trim());
  const flat = top.replaceAll(HIDDEN, '');
  const operators = [...top.matchAll(OPERATOR)];
  if (operators.length === 0 && flat.startsWith('!') && CHAIN.test(flat.slice(1).trim())) {
    return text.slice(1).trim();
  }
  if (operators.length === 0 && CHAIN.test(flat)) {
    return `!${text}`;
  }
  if (operators.length === 1 && operators[0][0] in FLIPPED) {
    const [{ 0: token, index }] = operators;
    return `${text.slice(0, index)}${FLIPPED[token]}${text.slice(index + token.length)}`;
  }
  return `!(${text})`;
}
