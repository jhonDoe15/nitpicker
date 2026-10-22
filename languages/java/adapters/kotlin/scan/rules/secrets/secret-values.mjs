const OPENERS = '([{';
const CLOSERS = ')]}';
const CONTINUATION = /^\s*(?:\?:|\.|\+|\|\||&&|else\b)/;
const AFTER_LITERAL =
  /^\s*(?:$|[),;}\n]|else\b|\.\s*(?:toCharArray|toByteArray|trim|toString)\s*\()/;
const CALL_NAME = /([A-Za-z_]\w*)\s*$/;
const LAST_ARGUMENT_CALLS = new Set(['getOrDefault', 'getProperty', 'requireNonNullElse']);
const ONLY_ARGUMENT_CALLS = new Set(['orElse', 'valueOf', 'copyValueOf', 'String']);
const LAMBDA_CALLS = new Set(['orElseGet', 'getOrElse']);
const IF_HEAD = /^\s*if\s*\([^]*\)\s*$/;
const ELSE_TAIL = /\belse\s*$/;
const ELVIS_TAIL = /\?:\s*$/;

function continues(code, newline) {
  return CONTINUATION.test(code.slice(newline + 1).replace(/^\s*/, ''));
}

function expressionEnd(code, from) {
  let depth = 0;
  for (const [offset, char] of [...code.slice(from)].entries()) {
    depth += OPENERS.includes(char) ? 1 : 0;
    depth -= CLOSERS.includes(char) ? 1 : 0;
    const ends = (char === ',' || char === ';') && depth === 0;
    const wrapped = char === '\n' && depth === 0 && !continues(code, from + offset);
    if (ends || wrapped || depth < 0) {
      return from + offset;
    }
  }
  return code.length;
}

function enclosingCall(code, from, at) {
  let depth = 0;
  const reversed = [...code.slice(from, at)].toReversed().entries();
  for (const [back, char] of reversed) {
    const index = at - 1 - back;
    depth += CLOSERS.includes(char) ? 1 : 0;
    const opens = OPENERS.includes(char);
    if (opens && depth === 0) {
      return { bracket: char, name: CALL_NAME.exec(code.slice(from, index))?.[1] };
    }
    depth -= opens ? 1 : 0;
  }
  return undefined;
}

function isFallbackPosition(code, from, literal) {
  const before = code.slice(from, literal.start);
  const previous = before.trimEnd().at(-1);
  if (before.trim() === '' || ELVIS_TAIL.test(before) || ELSE_TAIL.test(before)) {
    return true;
  }
  if (IF_HEAD.test(before)) {
    return true;
  }
  const call = enclosingCall(code, from, literal.start);
  if (call === undefined) {
    return false;
  }
  if (call.bracket === '{') {
    return LAMBDA_CALLS.has(call.name) && previous === '{';
  }
  const last = code.slice(literal.end).trimStart()[0] === ')';
  return (
    (ONLY_ARGUMENT_CALLS.has(call.name) && previous === '(') ||
    (LAST_ARGUMENT_CALLS.has(call.name) && previous === ',' && last)
  );
}

function chainFrom({ code, outer, head, limit }) {
  const parts = [head];
  for (const next of outer) {
    const gap = code.slice(parts.at(-1).end, next.start);
    if (next.start >= limit || !/^\s*\+\s*$/.test(gap) || next.template) {
      break;
    }
    parts.push(next);
  }
  return parts;
}

export function fallbackLiterals(scanned, from) {
  const { code } = scanned;
  const limit = expressionEnd(code, from);
  const inside = scanned.literals.filter(({ start, end }) => start >= from && end <= limit);
  const outer = inside.filter((literal) => !inside.some((other) => contains(other, literal)));
  return outer.flatMap((head, index) => {
    const chain = chainFrom({ code, outer: outer.slice(index + 1), head, limit });
    const last = chain.at(-1);
    const joinedBefore = /\+\s*$/.test(code.slice(from, head.start));
    const stable =
      !joinedBefore &&
      !head.template &&
      isFallbackPosition(code, from, head) &&
      AFTER_LITERAL.test(code.slice(last.end, limit + 1)) &&
      !/^\s*\+/.test(code.slice(last.end, limit));
    const text = chain.map((part) => part.text.replaceAll('\\$', '$')).join('');
    return stable ? [{ start: head.start, text }] : [];
  });
}

function contains(outer, inner) {
  return outer !== inner && outer.start < inner.start && inner.end <= outer.end;
}
