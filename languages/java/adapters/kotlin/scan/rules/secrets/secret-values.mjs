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

export function expressionEnd(code, from) {
  let depth = 0;
  for (let index = from; index < code.length; index += 1) {
    const char = code[index];
    if (OPENERS.includes(char)) {
      depth += 1;
    } else if (CLOSERS.includes(char)) {
      depth -= 1;
    }
    const ends = (char === ',' || char === ';') && depth === 0;
    const wrapped = char === '\n' && depth === 0 && !continues(code, index);
    if (ends || wrapped || depth < 0) {
      return index;
    }
  }
  return code.length;
}

function enclosingCall(code, from, at) {
  let depth = 0;
  for (let index = at - 1; index >= from; index -= 1) {
    if (CLOSERS.includes(code[index])) {
      depth += 1;
    } else if (OPENERS.includes(code[index])) {
      if (depth === 0) {
        return { bracket: code[index], name: CALL_NAME.exec(code.slice(from, index))?.[1] };
      }
      depth -= 1;
    }
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

function chainFrom(scanned, outer, head, limit) {
  const parts = [head];
  for (const next of outer) {
    const gap = scanned.code.slice(parts.at(-1).end, next.start);
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
    const chain = chainFrom(scanned, outer.slice(index + 1), head, limit);
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
