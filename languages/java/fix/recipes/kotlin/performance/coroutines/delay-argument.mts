import { bindingsOf } from '../repositories/declared-names.mts';

const LITERAL = /^\d[\d_]*[Ll]?$/u;
const NAME = /^[A-Za-z_]\w*$/u;
const CONVERTED = /^[\w.]+\.toLong\(\)$/u;
const MILLIS = /^([\w.]+)\.toMillis\(\s*(?:(\d[\d_]*[Ll]?)\s*)?\)$/u;
const TIME_UNIT_CONSTANT = /^(?:java\.util\.concurrent\.)?TimeUnit\.[A-Z_]+$/u;
const MILLIS_TYPES = new Set(['Duration', 'java.time.Duration', 'TimeUnit']);
const OPERATORS = new Set(['+', '-', '*', '/', '%']);

function isLongName(code: string, name: string): boolean {
  const bindings = bindingsOf(code, name);
  return (
    bindings.length > 0 &&
    bindings.every(
      (binding) =>
        binding.kind === 'typed' && (binding.type === 'Long' || binding.type === 'kotlin.Long'),
    )
  );
}

function isMillisCall(code: string, text: string): boolean {
  const match = MILLIS.exec(text);
  const [, receiver = '', amount] = match ?? [];
  if (match === null) {
    return false;
  }
  if (TIME_UNIT_CONSTANT.test(receiver)) {
    return amount !== undefined;
  }
  const bindings = bindingsOf(code, receiver);
  return (
    NAME.test(receiver) &&
    bindings.length > 0 &&
    bindings.every(
      (binding) =>
        binding.kind === 'typed' &&
        MILLIS_TYPES.has(binding.type) &&
        (binding.type === 'TimeUnit') === (amount !== undefined),
    )
  );
}

function isAtom(code: string, text: string): boolean {
  return (
    LITERAL.test(text) ||
    CONVERTED.test(text) ||
    isMillisCall(code, text) ||
    (NAME.test(text) && isLongName(code, text))
  );
}

function splitOperands(text: string): readonly string[] {
  const operands: string[] = [];
  let depth = 0;
  let from = 0;
  for (const [index, character] of text.split('').entries()) {
    if ('([{'.includes(character)) {
      depth += 1;
    } else if (')]}'.includes(character)) {
      depth -= 1;
    } else if (depth === 0 && OPERATORS.has(character)) {
      operands.push(text.slice(from, index));
      from = index + 1;
    }
  }
  return [...operands, text.slice(from)];
}

function unwrapped(text: string): string | undefined {
  if (!(text.startsWith('(') && text.endsWith(')'))) {
    return undefined;
  }
  const inner = text.slice(1, -1);
  let depth = 0;
  for (const character of inner) {
    depth += { '(': 1, ')': -1 }[character] ?? 0;
    if (depth < 0) {
      return undefined;
    }
  }
  return depth === 0 ? inner : undefined;
}

function partsOf(code: string, part: string): readonly string[] | undefined {
  const inner = unwrapped(part);
  const operands = splitOperands(part);
  if (part === '') {
    return undefined;
  }
  if (inner !== undefined) {
    return [inner];
  }
  if (operands.length > 1) {
    return operands;
  }
  return isAtom(code, part) ? [] : undefined;
}

export function isLongExpression(code: string, expression: string): boolean {
  const pending = [expression];
  for (const next of pending) {
    const parts = partsOf(code, next.trim());
    if (parts === undefined) {
      return false;
    }
    for (const part of parts) {
      pending.push(part);
    }
  }
  return true;
}
