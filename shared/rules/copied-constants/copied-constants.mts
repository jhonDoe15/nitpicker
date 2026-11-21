export type ConstantLiteral =
  | { readonly kind: 'string'; readonly value: string }
  | { readonly kind: 'number'; readonly value: number };

type TemplateKind = ConstantLiteral['kind'];
type ShownLiteral = { readonly kind: TemplateKind; readonly value: string | number };

const CONSTANT_NAME = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/u;
const TRIVIAL_NUMBERS = new Set([-1, 0, 1, 2]);
const MINIMUM_STRING_LENGTH = 3;
const BLANK = /^\s*$/u;

export function isConstantName(name: string): boolean {
  return name.length >= 2 && CONSTANT_NAME.test(name);
}

export function isTrivialValue(literal: ConstantLiteral): boolean {
  if (literal.kind === 'number') {
    return !Number.isFinite(literal.value) || TRIVIAL_NUMBERS.has(literal.value);
  }
  return literal.value.length < MINIMUM_STRING_LENGTH || BLANK.test(literal.value);
}

export function valueKey({ kind, value }: ConstantLiteral): string {
  return `${kind}:${String(value)}`;
}

const OUTCOME =
  'when {name} changes, the test keeps checking the old value or stops testing the case it was written for.';
const PINNED =
  'If the value is a contract the test pins on purpose, assert it next to the constant: {pin}.';
const TEMPLATES: Readonly<Record<TemplateKind, string>> = {
  number: `This literal copies {name}{also} from {owner}: ${OUTCOME} Use {name} (or an expression on it, such as {name} + 1). ${PINNED}`,
  string: `This literal copies {name}{also} from {owner}: ${OUTCOME} Use {name} (or build the text from it). ${PINNED}`,
};
const PLACEHOLDER = /\{(\w+)\}/gu;

function shown(literal: ShownLiteral): string {
  return literal.kind === 'number' ? String(literal.value) : JSON.stringify(literal.value);
}

export function copiedConstantTemplate(kind: TemplateKind, pin: string): string {
  return TEMPLATES[kind].replace('{pin}', () => pin);
}

export function copiedConstantData({
  names,
  owner,
  literal,
}: {
  readonly names: readonly string[];
  readonly owner: string;
  readonly literal: ShownLiteral;
}): Readonly<Record<string, string | undefined>> {
  const [name, ...others] = names;
  return {
    name,
    also: others.length === 0 ? '' : ` (and ${others.join(', ')}, which hold the same value)`,
    owner,
    value: shown(literal),
  };
}

export function copiedConstantMessage({
  names,
  owner,
  literal,
  pin,
}: {
  readonly names: readonly string[];
  readonly owner: string;
  readonly literal: ShownLiteral;
  readonly pin: string;
}): string {
  const data = copiedConstantData({ names, owner, literal });
  return copiedConstantTemplate(literal.kind, pin).replaceAll(
    PLACEHOLDER,
    (whole: string, key: string) => (Object.hasOwn(data, key) ? String(data[key]) : whole),
  );
}
