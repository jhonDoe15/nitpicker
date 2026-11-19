type Names = {
  items: string;
  cap: string;
  item: string;
  header: string;
  names: string;
  name: string;
};
type Options = {
  before?: readonly string[];
  inLoop?: readonly string[];
  inRun?: readonly string[];
  after: readonly string[];
};

const FIRST: Names = {
  items: 'items',
  cap: 'limit',
  item: 'item',
  header: 'header',
  names: 'names',
  name: 'name',
};
const SECOND: Names = {
  items: 'values',
  cap: 'cap',
  item: 'value',
  header: 'found',
  names: 'keys',
  name: 'key',
};

function report(signature: string, names: Names, options: Options): string {
  const { items, cap, item, header, names: sorted, name } = names;
  const { before = [], inLoop = [], inRun = [], after } = options;
  return [
    `def ${signature}:`,
    ...before.map((line) => `    ${line}`),
    `    ${header} = []`,
    `    for ${item} in ${items}:`,
    ...inLoop.map((line) => `        ${line}`),
    `        if len(${item}) > ${cap}:`,
    `            ${header}.append(${item}.strip().lower())`,
    `    ${sorted} = sorted(set(${header}))`,
    `    for ${name} in ${sorted}:`,
    `        record(${name}, ${cap})`,
    ...inRun.map((line) => `    ${line}`),
    ...after.map((line) => `    ${line}`),
    '',
  ].join('\n');
}

export function reportPair(
  first: Partial<Options> = {},
  second: Partial<Options> = {},
): [string, string] {
  return [
    report('top(items, limit)', FIRST, { after: ['return ",".join(names)'], ...first }),
    report('bottom(values, cap)', SECOND, {
      before: ['count = len(values)'],
      after: ['return len(keys) + count'],
      ...second,
    }),
  ];
}

function indented(text: string): string {
  return text.replaceAll(/^(?=.)/gmu, '    ');
}

export function methods(...functions: readonly string[]): string {
  return `class Report:\n${functions
    .map((text) =>
      indented(text)
        .replace('def top(', 'def top(self, ')
        .replace('def bottom(', 'def bottom(self, ')
        .replaceAll('record(', 'self.record('),
    )
    .join('\n')}`;
}
