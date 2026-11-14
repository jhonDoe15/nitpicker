const PRIMITIVES = new Set(['int', 'long', 'short', 'byte', 'char', 'boolean', 'float', 'double']);
const NUMBERS = new Set([...PRIMITIVES, 'Int', 'Long', 'Short', 'Byte', 'Char', 'Double', 'Float']);
const SINGLE = new Set(['float', 'Float']);
const VALUE_LITERALS = new Set(['number', 'char', 'boolean', 'null']);
const SINGLETON_LITERALS = new Set(['null', 'enum']);
const ARITHMETIC = new Set(['-', '*', '/', '%', '<<', '>>', '>>>', '&', '|', '^']);
const RELATIONS = new Set(['==', '!=', '<', '<=', '>', '>=']);
const NULLABLE = /\?$/u;
const NUMBER_SUFFIX = /[lfd]$/iu;

function typeOf(node, scope) {
  const text = node.kind === 'name' ? scope.types?.get(node.value) : undefined;
  return text?.replace(NULLABLE, '');
}

function isPrimitiveSide(node, scope) {
  return (
    (node.kind === 'literal' && VALUE_LITERALS.has(node.literal)) ||
    PRIMITIVES.has(typeOf(node, scope)) ||
    (node.kind === 'binary' && ARITHMETIC.has(node.value))
  );
}

function isNumberLiteral(node) {
  return node.kind === 'literal' && node.literal === 'number';
}

function literalValue(node) {
  return Number(node.value.replace(NUMBER_SUFFIX, ''));
}

function isRoundedForFloat(node, scope) {
  const [left, right] = node.children;
  const [literal, other] = isNumberLiteral(left) ? [left, right] : [right, left];
  if (!(isNumberLiteral(literal) && SINGLE.has(typeOf(other, scope)))) {
    return false;
  }
  const value = literalValue(literal);
  return Number.isFinite(value) && Math.fround(value) !== value;
}

function isUntypedNumberTest(node, scope) {
  const [left, right] = node.children;
  const [literal, other] = isNumberLiteral(left) ? [left, right] : [right, left];
  const type = typeOf(other, scope);
  return isNumberLiteral(literal) && type !== undefined && !NUMBERS.has(type);
}

function isIdentityTest(node, scope) {
  const sides = node.children;
  return scope.kotlin
    ? node.value === '===' && !sides.some((side) => SINGLETON_LITERALS.has(side.literal))
    : (node.value === '==' || node.value === '!=') &&
        !sides.some((side) => isPrimitiveSide(side, scope) || SINGLETON_LITERALS.has(side.literal));
}

/**
 * Whether the comparison `node` may not be read as plain value equality or order of its operands:
 * Java `==` and Kotlin `===` on references compare identity, Kotlin `==` on a value typed `Any`
 * calls `equals` (0.0 and -0.0 differ, 0 and 0.0 differ), and a number literal beside a
 * `float` operand is rounded to a float first.
 */
export function isOpaqueComparison(node, scope) {
  if (scope.references !== true || node.kind !== 'binary' || node.equal === true) {
    return false;
  }
  if (!RELATIONS.has(node.value) && node.value !== '===' && node.value !== '!==') {
    return false;
  }
  return (
    isIdentityTest(node, scope) ||
    isRoundedForFloat(node, scope) ||
    (scope.kotlin === true && node.value.length === 2 && isUntypedNumberTest(node, scope))
  );
}
