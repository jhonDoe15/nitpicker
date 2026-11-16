import { present } from '../../syntax.mts';

function capitalized(token: string): string {
  const word = present(token.split('.').at(-1));
  return `${present(word[0]).toUpperCase()}${word.slice(1)}`;
}

function typeWord(type: string): string {
  const [raw, ...rest] = type
    .replaceAll('[]', 'Array')
    .split(/[<>,\s]+/u)
    .filter((token) => token !== '');
  return `${capitalized(present(raw))}${rest.length === 0 ? '' : 'Of'}${rest.map(capitalized).join('')}`;
}

export function interfaceName({ types }: { readonly types: readonly string[] }): string {
  return `${types.map(typeWord).join('')}Creator`;
}

export function nameClash(
  groups: readonly { readonly types: readonly string[] }[],
  taken: ReadonlySet<string>,
): boolean {
  const seen = new Map<string, string>();
  return groups.some((group) => {
    const name = interfaceName(group);
    const other = seen.get(name);
    seen.set(name, group.types.join('\u0000'));
    return taken.has(name) || (other !== undefined && other !== group.types.join('\u0000'));
  });
}

export function interfaceText(
  { name, types, visibility }: { name: string; types: readonly string[]; visibility: string },
  { base, unit }: { base: string; unit: string },
): string {
  const access = visibility === '' ? '' : `${visibility} `;
  const parameters = types.map((type, index) => `${type} argument${String(index)}`).join(', ');
  return `${access}interface ${name}<T, E extends Exception> {
${base}${unit}T create(${parameters}) throws E;
${base}}`;
}
