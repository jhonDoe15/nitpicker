import {
  argumentUnitOfCallName,
  conversionExample,
  unitFactor,
  unitLabel,
  unitOfName,
} from '../../../../../../../shared/naming/time-units/unit-names.mjs';
import { unitMessage } from '../../../../../../../shared/naming/time-units/unit-messages.mjs';
import { closingIndex, kotlinTokens } from './kotlin-tokens.mjs';
import { UnitParser } from './unit-expressions.mjs';

export const TIME_UNIT_RULE = 'TimeUnitMismatch';
const MAX_TEXT = 40;
const KEEP = 'Keep epoch times in a `Long` or an `Instant`.';
const STARTS = new Set([
  '(',
  ',',
  '{',
  ';',
  '->',
  '&&',
  '||',
  '!',
  '[',
  '?:',
  '=',
  '+=',
  '-=',
  '..',
  '}',
]);
const START_WORDS = new Set(['return', 'else', 'in', 'if', 'while']);
const ASSIGNING = new Set(['=', '+=', '-=']);
const TYPE_PARTS = new Set(['.', '<', '>', '?', ',', '*']);
const DURATION_IMPORT = /\bimport\s+kotlin\.time\.Duration\.Companion\.(\w+|\*)/gu;

function shortened(text) {
  return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT - 3)}...` : text;
}

const DECLARATION_ENDS = new Set(['\n', ';', '{', '}', '(']);

function initializerOf(tokens, index) {
  for (let at = index + 2; at < tokens.length; at += 1) {
    const { text } = tokens[at];
    if (text === '=') {
      return at + 1;
    }
    if (DECLARATION_ENDS.has(text)) {
      return undefined;
    }
  }
  return undefined;
}

function declaredValues(tokens) {
  const found = new Map();
  tokens.forEach((token, index) => {
    const name = tokens[index + 1];
    if (
      token.kind === 'id' &&
      (token.text === 'val' || token.text === 'var') &&
      name?.kind === 'id'
    ) {
      const start = token.text === 'val' ? initializerOf(tokens, index) : undefined;
      found.set(name.text, found.has(name.text) || start === undefined ? null : start);
    }
  });
  return new Map([...found].filter(([, start]) => start !== null));
}

function parameterNames(tokens, open) {
  const close = closingIndex(tokens, open);
  return tokens
    .slice(open + 1, close)
    .filter(
      (token, index, inside) =>
        token.kind === 'id' && inside[index + 1]?.text === ':' && token.inside === '(',
    )
    .map(({ text }) => text);
}

function functionOpen(tokens, index) {
  for (let at = index + 1; at < tokens.length && at < index + 8; at += 1) {
    if (tokens[at].text === '(') {
      return at;
    }
  }
  return undefined;
}

function declaredFunctions(tokens) {
  const found = new Map();
  tokens.forEach((token, index) => {
    const open =
      token.kind === 'id' && token.text === 'fun' ? functionOpen(tokens, index) : undefined;
    const name = open === undefined ? undefined : tokens[open - 1];
    if (name?.kind === 'id') {
      found.set(name.text, found.has(name.text) ? null : parameterNames(tokens, open));
    }
  });
  return new Map([...found].filter(([, names]) => names !== null));
}

function assignmentTarget(tokens, index) {
  const before = tokens[index - 1];
  if (before?.kind !== 'id') {
    return undefined;
  }
  let at = index - 1;
  while (
    at > 0 &&
    (tokens[at].kind === 'id' || TYPE_PARTS.has(tokens[at].text)) &&
    tokens[at].text !== ':'
  ) {
    at -= 1;
  }
  if (tokens[at]?.text === ':' && tokens[at - 1]?.kind === 'id') {
    return { name: tokens[at - 1].text, named: false };
  }
  const opener = tokens[index - 2];
  const named = before.inside === '(' && (opener?.text === '(' || opener?.text === ',');
  return { name: before.text, named };
}

class UnitFile {
  constructor(scanned) {
    this.code = scanned.code;
    this.tokens = kotlinTokens(scanned.code);
    this.values = declaredValues(this.tokens);
    this.functions = declaredFunctions(this.tokens);
    this.imports = new Set([...scanned.code.matchAll(DURATION_IMPORT)].map((match) => match[1]));
    this.reports = new Map();
  }

  durationProperty(name) {
    return this.imports.has(name) || this.imports.has('*');
  }

  textOf(value) {
    if (value.from === undefined || value.to === undefined || value.to < value.from) {
      return value.name ?? 'value';
    }
    const { start } = this.tokens[value.from];
    const { end } = this.tokens[value.to];
    return shortened(this.code.slice(start, end).replaceAll(/\s+/gu, ' '));
  }

  report(offset, kind, values) {
    const key = `${String(offset)}:${kind}`;
    if (!this.reports.has(key)) {
      this.reports.set(key, {
        rule: TIME_UNIT_RULE,
        offset,
        message: unitMessage(kind, { keep: KEEP, ...values }),
      });
    }
  }

  convertedValues(from, to, value) {
    return {
      valueUnit: unitLabel(from),
      targetUnit: unitLabel(to),
      factor: String(unitFactor(from, to)),
      example: conversionExample(value, from, to),
    };
  }

  mixed(operator, left, right) {
    const value = this.textOf(right);
    this.report(operator.start, 'mixed', {
      left: this.textOf(left),
      leftUnit: unitLabel(left.unit),
      right: value,
      rightUnit: unitLabel(right.unit),
      factor: String(unitFactor(left.unit, right.unit)),
      example: conversionExample(value, right.unit, left.unit),
    });
  }

  argument(nameIndex, callee, unit, value, parameter) {
    if (unit === undefined || value?.unit === undefined || value.unit === unit) {
      return;
    }
    const text = this.textOf(value);
    const offset =
      value.from === undefined ? this.tokens[nameIndex].start : this.tokens[value.from].start;
    this.report(offset, 'argument', {
      callee,
      parameter,
      value: text,
      ...this.convertedValues(value.unit, unit, text),
    });
  }

  assigned(index, target, value) {
    const unit = unitOfName(target);
    if (unit === undefined || value.unit === undefined || value.unit === unit) {
      return;
    }
    const text = this.textOf(value);
    this.report(this.tokens[index].start, 'assigned', {
      target,
      value: text,
      ...this.convertedValues(value.unit, unit, text),
    });
  }

  narrowed(index, value, operator) {
    this.report(this.tokens[index].start, 'narrowed', { value: this.textOf(value), operator });
  }

  checkCall({ name, nameIndex, args, receiver, unit }) {
    const positional = args.filter((arg) => arg.name === undefined);
    const known = unit ?? argumentUnitOfCallName(name);
    const callee = receiver?.name === undefined ? name : `${receiver.name}.${name}`;
    if (known !== undefined && positional[0] !== undefined) {
      this.argument(nameIndex, callee, known, positional[0].value, name);
    }
    const parameters = this.functions.get(name) ?? [];
    positional.forEach((arg, index) => {
      const parameter = parameters[index];
      if (parameter !== undefined) {
        this.argument(nameIndex, callee, unitOfName(parameter), arg.value, parameter);
      }
      const paired = positional[index + 1]?.value.timeUnit;
      if (paired !== undefined) {
        this.argument(nameIndex, callee, paired, arg.value, positional[index + 1].value.name);
      }
    });
    args
      .filter((arg) => arg.name !== undefined)
      .forEach((arg) =>
        this.argument(nameIndex, callee, unitOfName(arg.name), arg.value, arg.name),
      );
  }

  scan() {
    this.tokens.forEach((token, index) => {
      const previous = this.tokens[index - 1];
      const starts =
        index === 0 ||
        previous.kind === 'nl' ||
        (previous.kind === 'op' && STARTS.has(previous.text)) ||
        (previous.kind === 'id' && START_WORDS.has(previous.text));
      if (starts && token.kind !== 'nl') {
        new UnitParser(this, index).expression();
      }
      if (token.kind === 'op' && ASSIGNING.has(token.text)) {
        this.assignment(index);
      }
    });
    return [...this.reports.values()];
  }

  assignment(index) {
    const target = assignmentTarget(this.tokens, index);
    if (target === undefined || target.named) {
      return;
    }
    const value = new UnitParser(this, index + 1).expression();
    this.assigned(index + 1, target.name, value);
  }
}

export function timeUnitMismatches(scanned) {
  return new UnitFile(scanned).scan();
}

export const kotlinSourceRules = {
  messages: {
    [TIME_UNIT_RULE]:
      'Time values in different units meet here without a conversion (seconds with milliseconds, for example), or an epoch time is cut to a 32-bit `Int`. Convert once where the value enters, name it with its unit, and keep epoch times in a `Long` or an `Instant`.',
  },
  main: [timeUnitMismatches],
};
