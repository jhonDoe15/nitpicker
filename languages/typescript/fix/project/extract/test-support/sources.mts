type CopyOptions = { prefix?: string; exported?: false; typed?: false };

function bodyOf(prefix: string): string {
  return `  const selected = selection.filter((element) => element.length < limit);
  const label = selected.map((element) => element.trim()).join(',');
  const output = (label.length > 0 ? '${prefix}' : 'none:') + label + selected.length;
  return output.padEnd(limit, '-');`;
}

export function copy(name: string, { prefix = 'top:', exported, typed }: CopyOptions = {}): string {
  const head = typed === false ? 'selection, limit' : 'selection: string[], limit: number';
  const returns = typed === false ? '' : ': string';
  const keyword = exported === false ? '' : 'export ';
  return `${keyword}function ${name}(${head})${returns} {\n${bodyOf(prefix)}\n}\n`;
}

export function pair(options: CopyOptions = {}): string {
  return `${copy('alignTop', options)}\n${copy('alignBottom', { ...options, prefix: 'bottom:' })}`;
}

function indented(text: string): string {
  return text.replaceAll(/^/gmu, '  ');
}

export function twoMethods(transform: (text: string) => string = identity): string {
  const methods = ['top', 'bottom'].map(
    (name) =>
      `  ${name}(selection: string[], limit: number): string {\n${indented(transform(bodyOf(`${name}:`)))}\n  }\n`,
  );
  return `export class Aligner {\n${methods.join('\n')}}\n`;
}

function identity(text: string): string {
  return text;
}

export function asyncCopy(name: string, prefix: string): string {
  return `export async function ${name}(selection: string[], limit: number): Promise<string> {
  const selected = selection.filter((element) => element.length < limit);
  const label = await Promise.resolve(selected.join(','));
  const output = (label.length > 0 ? '${prefix}' : 'none:') + label + selected.length;
  return output.padEnd(limit, '-');
}
`;
}

export function arrow(name: string, key: string): string {
  return `export const ${name} = (rows: { tags: string[]; ${key}: number }[], floor: number) =>
  rows.filter((row) => row.${key} > floor).map((row) => row.tags.join('-')).sort().slice(0, floor);
`;
}

export function loader(name: string, load: string): string {
  return `export function ${name}(ids: string[], limit: number): string[] {
  const found = ids.filter((id) => id.length < limit);
  const names = found.map((id) => ${load}(id));
  const total = names.length + found.length;
  return total > limit ? names.slice(0, limit) : names;
}
`;
}

export function dates(name: string, time: string): string {
  return `export function ${name}(ids: string[], limit: number): Date[] {
  const found = ids.filter((id) => id.length < limit);
  const dates = found.map((id) => new Date(id + '${time}'));
  const total = dates.length + found.length;
  return total > limit ? dates.slice(0, limit) : dates;
}
`;
}
