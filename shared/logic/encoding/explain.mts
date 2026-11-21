import type { Encoding, Z3Expression, Z3Model } from '../typed/solver-types.mts';

type Explained = Pick<Encoding, 'z3' | 'atoms' | 'unsigned'>;

const SHOWN_ATOMS = /^(?:value|truth):\(?(?:name|member|index|call|this)\b/u;
const NEGATIVE = /\(- (?<magnitude>[\d./]+)\)/gu;
const UNNAMED = /^[ac]\d+$/u;

function shown(encoding: Explained, constant: Z3Expression, model: Z3Model): string {
  const value = model.eval(constant);
  if (!encoding.z3.isBitVecVal(value)) {
    return value.sexpr();
  }
  const unsigned = encoding.unsigned.has(constant);
  return String(unsigned ? value.value() : value.asSignedValue());
}

function shownAtoms(encoding: Explained, model: Z3Model): string[] {
  return [...encoding.atoms]
    .filter(([name]) => SHOWN_ATOMS.test(name))
    .map(([name, constant]): [string, string] => [
      name.slice(name.indexOf(':') + 1),
      shown(encoding, constant, model),
    ])
    .filter(([, value]) => !UNNAMED.test(value))
    .map(
      ([name, value]) =>
        `${name} = ${value.replaceAll(NEGATIVE, (_match, magnitude: string) => `-${magnitude}`)}`,
    )
    .toSorted();
}

export function counterexampleOf(encoding: Explained, model: Z3Model): string {
  return shownAtoms(encoding, model).join(', ');
}
