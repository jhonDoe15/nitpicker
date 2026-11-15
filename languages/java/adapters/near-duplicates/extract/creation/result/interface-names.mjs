function capitalized(token) {
  const word = token.split('.').at(-1);
  return `${word[0].toUpperCase()}${word.slice(1)}`;
}

function typeWord(type) {
  const [raw, ...rest] = type
    .replaceAll('[]', 'Array')
    .split(/[<>,\s]+/u)
    .filter((token) => token !== '');
  return `${capitalized(raw)}${rest.length === 0 ? '' : 'Of'}${rest.map(capitalized).join('')}`;
}

export function interfaceName({ types }) {
  return `${types.map(typeWord).join('')}Creator`;
}

export function nameClash(groups, taken) {
  const seen = new Map();
  return groups.some((group) => {
    const name = interfaceName(group);
    const other = seen.get(name);
    seen.set(name, group.types.join('\u0000'));
    return taken.has(name) || (other !== undefined && other !== group.types.join('\u0000'));
  });
}

export function interfaceText({ name, types, visibility }, { base, unit }) {
  const access = visibility === '' ? '' : `${visibility} `;
  const parameters = types.map((type, index) => `${type} argument${index}`).join(', ');
  return `${access}interface ${name}<T, E extends Exception> {
${base}${unit}T create(${parameters}) throws E;
${base}}`;
}
