const SHOWN_ATOMS = /^(?:value|truth):\(?(?:name|member|index|call|this)\b/u;
const NEGATIVE = /\(- (?<magnitude>[\d./]+)\)/gu;
const UNNAMED = /^[ac]\d+$/u;

function shown(encoding, constant, model) {
  const value = model.eval(constant);
  if (typeof value.asSignedValue !== 'function') {
    return String(value);
  }
  const unsigned = encoding.unsigned.has(constant);
  return String(unsigned ? value.value() : value.asSignedValue());
}

function shownAtoms(encoding, model) {
  return [...encoding.atoms]
    .filter(([name]) => SHOWN_ATOMS.test(name))
    .map(([name, constant]) => [
      name.slice(name.indexOf(':') + 1),
      shown(encoding, constant, model),
    ])
    .filter(([, value]) => !UNNAMED.test(value))
    .map(([name, value]) => `${name} = ${value.replaceAll(NEGATIVE, '-$<magnitude>')}`)
    .toSorted();
}

/** The values the model gives the named atoms, as `name = value` joined by commas. */
export function counterexampleOf(encoding, model) {
  return shownAtoms(encoding, model).join(', ');
}
