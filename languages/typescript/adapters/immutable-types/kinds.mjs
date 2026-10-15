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
};
