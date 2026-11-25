import { isSideEffectFree } from '../purity.mts';
import { key } from '../terms.mts';
import { required } from '../typed/term-parts.mts';
import type { Encoding, Z3Arith, Z3Bool, Z3Expression, Z3Vector } from '../typed/solver-types.mts';
import type { Term } from '../typed/term-types.mts';
import { isExactNumber } from './numbers.mts';

const VALUE = 'value';

function isStable(encoding: Encoding, node: Term): boolean {
  if (node.kind === 'opaque') {
    return false;
  }
  return encoding.sameCalls || isSideEffectFree(node);
}

function atomId(encoding: Encoding, sort: string, node: Term): string {
  const identity = isStable(encoding, node)
    ? key(node)
    : `occurrence ${String(encoding.atoms.size)}`;
  return `${sort}:${identity}`;
}

function remember<Value>(
  map: Map<string, Value>,
  id: string,
  create: (index: number) => Value,
): Value {
  const made = create(map.size);
  map.set(id, made);
  return made;
}

function memo<Value>(map: Map<string, Value>, id: string, create: (index: number) => Value): Value {
  return map.get(id) ?? remember(map, id, create);
}

type AtomSpec<Atom extends Z3Expression> = {
  readonly id: string;
  readonly make: (name: string) => Atom;
  readonly accepts: (found: Z3Expression) => found is Atom;
};

function memoAtom<Atom extends Z3Expression>(
  atoms: Map<string, Z3Expression>,
  { id, make, accepts }: AtomSpec<Atom>,
): Atom {
  const atom = memo(atoms, id, (index) => make(`a${String(index)}`));
  if (!accepts(atom)) {
    throw new TypeError(`The atom ${id} was made as another sort`);
  }
  return atom;
}

export function boolAtom(encoding: Encoding, sort: string, node: Term): Z3Bool {
  const { z3 } = encoding;
  return memoAtom(encoding.atoms, {
    id: atomId(encoding, sort, node),
    make: (name) => z3.Bool.const(name),
    accepts: (found): found is Z3Bool => z3.isBool(found),
  });
}

export function numberAtom(encoding: Encoding, node: Term): Z3Arith {
  const { z3, numbers } = encoding;
  return memoAtom(encoding.atoms, {
    id: atomId(encoding, VALUE, node),
    make: (name) => numbers.const(name),
    accepts: (found): found is Z3Arith => z3.isArith(found),
  });
}

export function vectorAtom(encoding: Encoding, node: Term): Z3Vector {
  const { z3 } = encoding;
  const bits = required(node.bits, 'bit width');
  return memoAtom(encoding.atoms, {
    id: atomId(encoding, VALUE, node),
    make: (name) => z3.BitVec.const(name, bits),
    accepts: (found): found is Z3Vector => z3.isBitVec(found),
  });
}

export function literalValue(encoding: Encoding, node: Term): Z3Arith {
  const text = String(node.value);
  const { literals } = encoding;
  if (isExactNumber(node)) {
    return memo(literals, text, () => encoding.numbers.val(text));
  }
  return memo(literals, text, (index) => encoding.numbers.const(`c${String(index)}`));
}
