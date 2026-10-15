export const KINDS = {
  array: { label: 'array', hint: 'Type it `readonly T[]`.' },
  set: {
    label: 'Set',
    hint: 'Type it `ReadonlySet<T>`, or build it inline: `[...new Set(xs)]`.',
  },
  map: { label: 'Map', hint: 'Type it `ReadonlyMap<K, readonly V[]>`.' },
  execArray: {
    label: 'RegExpExecArray',
    hint: 'Destructure the match in the same statement, or use `.test`.',
  },
  date: {
    label: 'Date',
    hint: 'Type it `Readonly<Date>`, or keep it unbound like `new Date(ms).getUTCHours()`.',
  },
  schema: {
    label: 'zod schema',
    hint: 'Zod schemas are always mutable: keep them in adapters/, or inline the call where it is used.',
  },
  regexp: {
    label: 'RegExp',
    hint: 'RegExp objects are always mutable: keep them in adapters/, or write the literal inline where it is used.',
  },
  object: {
    label: 'object literal',
    hint: 'Give it a type with readonly fields: `const x: { readonly a: number } = ...`, or return it from a function with a readonly return type.',
  },
  callback: {
    label: 'callback',
    hint: "Annotate the callback's return type with readonly fields: `(item): Summary => ({ ... })`, or `(line): readonly string[] => ...`.",
  },
  rest: {
    label: 'rest element',
    hint: 'A rest element is always mutable: take the tail into an annotated const, `const rest: readonly T[] = xs.slice(1)`.',
  },
  groupBy: {
    label: 'Object.groupBy result',
    hint: 'Type it `Readonly<Partial<Record<Key, readonly T[]>>>`.',
  },
  typeParameter: {
    label: 'generic type',
    hint: 'Constrain the type parameter with readonly fields: `<T extends { readonly id: string }>`.',
  },
};

export const ERROR_CLASS_HINT =
  'Error is a class and always mutable: type the field `unknown` (domain/ allows `error` and `cause` typed unknown for a caught error) or carry `message: string`.';

const TYPE_NAME_KINDS = new Map([
  ['Array', 'array'],
  ['Set', 'set'],
  ['Map', 'map'],
  ['Date', 'date'],
  ['RegExp', 'regexp'],
  ['RegExpExecArray', 'execArray'],
  ['RegExpMatchArray', 'execArray'],
]);

export function kindOfTypeName(name) {
  return TYPE_NAME_KINDS.get(name);
}
