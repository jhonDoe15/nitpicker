function bodyOf(prefix) {
  return `  const selected = selection.filter((element) => element.length < limit);
  const label = selected.map((element) => element.trim()).join(',');
  const output = (label.length > 0 ? '${prefix}' : 'none:') + label + selected.length;
  return output.padEnd(limit, '-');`;
}

export function copy(name, { prefix = 'top:', exported = true, typed = true } = {}) {
  const head = typed ? 'selection: string[], limit: number' : 'selection, limit';
  const returns = typed ? ': string' : '';
  const keyword = exported ? 'export ' : '';
  return `${keyword}function ${name}(${head})${returns} {\n${bodyOf(prefix)}\n}\n`;
}

export function pair(options = {}) {
  return `${copy('alignTop', options)}\n${copy('alignBottom', { ...options, prefix: 'bottom:' })}`;
}

function indented(text) {
  return text.replaceAll(/^/gmu, '  ');
}

export function twoMethods(transform = identity) {
  const methods = ['top', 'bottom'].map(
    (name) =>
      `  ${name}(selection: string[], limit: number): string {\n${indented(transform(bodyOf(`${name}:`)))}\n  }\n`,
  );
  return `export class Aligner {\n${methods.join('\n')}}\n`;
}

function identity(text) {
  return text;
}

export function asyncCopy(name, prefix) {
  return `export async function ${name}(selection: string[], limit: number): Promise<string> {
  const selected = selection.filter((element) => element.length < limit);
  const label = await Promise.resolve(selected.join(','));
  const output = (label.length > 0 ? '${prefix}' : 'none:') + label + selected.length;
  return output.padEnd(limit, '-');
}
`;
}

export function arrow(name, key) {
  return `export const ${name} = (rows: { tags: string[]; ${key}: number }[], floor: number) =>
  rows.filter((row) => row.${key} > floor).map((row) => row.tags.join('-')).sort().slice(0, floor);
`;
}

export function loader(name, load) {
  return `export function ${name}(ids: string[], limit: number): string[] {
  const found = ids.filter((id) => id.length < limit);
  const names = found.map((id) => ${load}(id));
  const total = names.length + found.length;
  return total > limit ? names.slice(0, limit) : names;
}
`;
}

export function dates(name, time) {
  return `export function ${name}(ids: string[], limit: number): Date[] {
  const found = ids.filter((id) => id.length < limit);
  const dates = found.map((id) => new Date(id + '${time}'));
  const total = dates.length + found.length;
  return total > limit ? dates.slice(0, limit) : dates;
}
`;
}

export function typed(name, element, { cast = '', guard = '' } = {}) {
  return `export function ${name}(items: ${element}[], limit: number): ${element}[] {
  const picked: ${element}[] = [];
  for (const item of items) {
    if (picked.length < limit${guard}) {
      picked.push(item${cast});
    }
  }
  picked.reverse();
  return picked;
}
`;
}

export function boxed(name, key, value) {
  return `export function ${name}(rows: Map<${key}, ${value}>, limit: number): Promise<${value}[]> {
  const kept: ${value}[] = [];
  for (const row of rows.values()) {
    if (kept.length < limit) {
      kept.push(row);
    }
  }
  kept.reverse();
  return Promise.resolve(kept);
}
`;
}

export function built(name, constructor) {
  return `export function ${name}(items: string[], limit: number): object[] {
  const picked: object[] = [];
  for (const item of items) {
    if (picked.length < limit) {
      picked.push(new ${constructor}(item));
    }
  }
  picked.reverse();
  return picked;
}
`;
}
