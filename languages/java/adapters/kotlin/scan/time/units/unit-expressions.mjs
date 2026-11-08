import {
  convertedUnit,
  unitOfName,
} from '../../../../../../../shared/naming/time-units/unit-names.mjs';
import { closingIndex } from './kotlin-tokens.mjs';
import { callValue, namedValue, selectorValue } from './unit-selectors.mjs';

const MAX_DEPTH = 3;
const COMPARING = new Set(['<', '<=', '>', '>=', '==', '!=', '===', '!==']);
const ADDING = new Set(['+', '-']);
const SCALING = new Set(['*', '/']);
const KEYWORDS = new Set([
  'if',
  'else',
  'when',
  'while',
  'for',
  'do',
  'return',
  'val',
  'var',
  'fun',
  'in',
  'is',
  'as',
  'throw',
  'try',
  'catch',
  'finally',
  'object',
  'class',
  'interface',
  'null',
  'true',
  'false',
  'import',
  'package',
  'typealias',
  'break',
  'continue',
]);
const PRIMARY_CALLS = { delay: 'ms', withTimeout: 'ms', withTimeoutOrNull: 'ms' };

export function mismatch(left, right) {
  return left?.unit !== undefined && right?.unit !== undefined && left.unit !== right.unit;
}

function scale(left, right, operator) {
  if (left.unit !== undefined && right.unit === undefined && right.constant !== undefined) {
    return { unit: convertedUnit(left.unit, right.constant, operator), epoch: left.epoch };
  }
  if (operator === '*' && right.unit !== undefined && left.constant !== undefined) {
    return { unit: convertedUnit(right.unit, left.constant, '*'), epoch: right.epoch };
  }
  if (operator === '*' && left.constant !== undefined && right.constant !== undefined) {
    return { constant: left.constant * right.constant };
  }
  return {};
}

function added(left, right, operator) {
  const unit = left.unit ?? right.unit;
  if (unit === undefined || left.text === true || right.text === true) {
    return {};
  }
  const epoch =
    operator === '-'
      ? left.epoch === true && right.constant !== undefined
      : left.epoch === true || right.epoch === true;
  return { unit, epoch };
}

export class UnitParser {
  constructor(file, position, depth = 0) {
    this.file = file;
    this.tokens = file.tokens;
    this.position = position;
    this.depth = depth;
  }

  peek(offset = 0) {
    return this.tokens[this.position + offset];
  }

  isOperator(texts, offset = 0) {
    const token = this.peek(offset);
    return token?.kind === 'op' && texts.has(token.text);
  }

  at(text, offset = 0) {
    const token = this.peek(offset);
    return token?.kind === 'op' && token.text === text;
  }

  text(from, to) {
    return this.file.code
      .slice(this.tokens[from].start, this.tokens[to].end)
      .replaceAll(/\s+/gu, ' ');
  }

  expression() {
    const start = this.position;
    const left = this.additive();
    if (!this.isOperator(COMPARING)) {
      return { ...left, from: start, to: this.position - 1 };
    }
    const operator = this.peek();
    this.position += 1;
    const right = this.additive();
    if (mismatch(left, right)) {
      this.file.mixed(operator, left, right);
    }
    return { from: start, to: this.position - 1 };
  }

  additive() {
    let left = this.term();
    while (this.isOperator(ADDING)) {
      const operator = this.peek();
      this.position += 1;
      const right = this.term();
      if (mismatch(left, right)) {
        this.file.mixed(operator, left, right);
        left = { from: left.from, to: right.to };
      } else {
        left = { ...added(left, right, operator.text), from: left.from, to: right.to };
      }
    }
    return left;
  }

  term() {
    let left = this.unary();
    while (this.isOperator(SCALING) || this.at('%')) {
      const operator = this.peek().text;
      this.position += 1;
      const right = this.unary();
      left = {
        ...(operator === '%' ? {} : scale(left, right, operator)),
        from: left.from,
        to: right.to,
      };
    }
    return left;
  }

  unary() {
    const from = this.position;
    if (this.at('-') || this.at('+')) {
      this.position += 1;
      const inner = this.unary();
      return {
        ...inner,
        constant: inner.constant === undefined ? undefined : -inner.constant,
        from,
      };
    }
    if (this.at('!')) {
      this.position += 1;
      this.unary();
      return { from, to: this.position - 1 };
    }
    return this.postfix();
  }

  postfix() {
    const from = this.position;
    let value = this.primary();
    for (;;) {
      if ((this.at('.') || this.at('?.')) && this.peek(1)?.kind === 'id') {
        const name = this.peek(1).text;
        const nameIndex = this.position + 1;
        this.position += 2;
        const args = this.at('(') ? this.arguments() : undefined;
        this.trailingLambda();
        value = selectorValue(this, { receiver: value, name, nameIndex, args, from });
      } else if (this.at('!!')) {
        this.position += 1;
      } else if (this.at('[')) {
        this.position = closingIndex(this.tokens, this.position) + 1;
        value = {};
      } else if (this.peek()?.kind === 'id' && this.peek().text === 'as') {
        this.position += this.at('?', 1) ? 3 : 2;
      } else {
        break;
      }
    }
    return { ...value, from, to: this.position - 1 };
  }

  trailingLambda() {
    if (this.at('{')) {
      this.position = closingIndex(this.tokens, this.position) + 1;
    }
  }

  primary() {
    const token = this.peek();
    if (token === undefined) {
      return {};
    }
    this.position += 1;
    if (token.kind === 'num') {
      return { constant: token.value };
    }
    if (token.kind === 'str') {
      return { text: true };
    }
    if (token.kind === 'op' && token.text === '(') {
      const open = this.position - 1;
      const inner = this.expression();
      this.position = closingIndex(this.tokens, open) + 1;
      return inner;
    }
    if (token.kind !== 'id' || KEYWORDS.has(token.text)) {
      return {};
    }
    return this.called(token);
  }

  called(token) {
    const name = token.text;
    const nameIndex = this.position - 1;
    if (this.at('(')) {
      const args = this.arguments();
      this.trailingLambda();
      this.file.checkCall({ name, nameIndex, args, receiver: {}, unit: PRIMARY_CALLS[name] });
      return callValue(name);
    }
    if (this.at('{')) {
      this.trailingLambda();
      return callValue(name);
    }
    return this.identifier(name);
  }

  identifier(name) {
    const own = unitOfName(name);
    if (own !== undefined || this.depth >= MAX_DEPTH) {
      return namedValue(name, own);
    }
    const declared = this.file.values.get(name);
    if (declared === undefined) {
      return { name };
    }
    const resolved = new UnitParser(this.file, declared, this.depth + 1).expression();
    return { name, unit: resolved.unit, epoch: resolved.epoch, constant: resolved.constant };
  }

  arguments() {
    const open = this.position;
    const close = closingIndex(this.tokens, open);
    const args = [];
    this.position += 1;
    while (this.position < close) {
      const named = this.peek()?.kind === 'id' && this.at('=', 1) ? this.peek().text : undefined;
      if (named !== undefined) {
        this.position += 2;
      }
      const start = this.position;
      const value = this.expression();
      args.push({ name: named, value: { ...value, from: start } });
      this.skipArgument(close);
    }
    this.position = close + 1;
    return args;
  }

  skipArgument(close) {
    while (this.position < close && !this.at(',')) {
      const token = this.peek();
      this.position =
        token.kind === 'op' && '([{'.includes(token.text)
          ? closingIndex(this.tokens, this.position) + 1
          : this.position + 1;
    }
    this.position += 1;
  }
}
