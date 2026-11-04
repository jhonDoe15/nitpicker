const CONSTANT_NAME = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/u;
const TRIVIAL_NUMBERS = new Set([-1, 0, 1, 2]);
const MINIMUM_STRING_LENGTH = 3;
const BLANK = /^\s*$/u;

/** Whether `name` is an UPPER_SNAKE constant name of at least two characters. */
export function isConstantName(name) {
  return name.length >= 2 && CONSTANT_NAME.test(name);
}

/** Whether a literal `{ kind: 'string' | 'number', value }` is too common to count as a copy. */
export function isTrivialValue({ kind, value }) {
  if (kind === 'number') {
    return !Number.isFinite(value) || TRIVIAL_NUMBERS.has(value);
  }
  return value.length < MINIMUM_STRING_LENGTH || BLANK.test(value);
}

/** The key two literals share when they hold the same value. */
export function valueKey({ kind, value }) {
  return `${kind}:${String(value)}`;
}

const OUTCOME =
  'when {name} changes, the test keeps checking the old value or stops testing the case it was written for.';
const PINNED =
  'If the value is a contract the test pins on purpose, assert it next to the constant: {pin}.';
const TEMPLATES = {
  number: `This literal copies {name}{also} from {owner}: ${OUTCOME} Use {name} (or an expression on it, such as {name} + 1). ${PINNED}`,
  string: `This literal copies {name}{also} from {owner}: ${OUTCOME} Use {name} (or build the text from it). ${PINNED}`,
};
const PLACEHOLDER = /\{(\w+)\}/gu;

function shown({ kind, value }) {
  return kind === 'number' ? String(value) : JSON.stringify(value);
}

/** The message template for a copied `kind` literal; `pin` is the language's pinning assertion. */
export function copiedConstantTemplate(kind, pin) {
  return TEMPLATES[kind].replace('{pin}', pin);
}

/** The placeholder values of the template for `literal`, which copies the constants `names`. */
export function copiedConstantData({ names, owner, literal }) {
  const [name, ...others] = names;
  return {
    name,
    also: others.length === 0 ? '' : ` (and ${others.join(', ')}, which hold the same value)`,
    owner,
    value: shown(literal),
  };
}

/** The message of a test literal that copies the value of one or more production constants. */
export function copiedConstantMessage({ names, owner, literal, pin }) {
  const data = copiedConstantData({ names, owner, literal });
  return copiedConstantTemplate(literal.kind, pin).replaceAll(PLACEHOLDER, (whole, key) =>
    Object.hasOwn(data, key) ? data[key] : whole,
  );
}
