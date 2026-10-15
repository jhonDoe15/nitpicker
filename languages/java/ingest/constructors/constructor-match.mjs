const PRIMITIVES = {
  B: 'byte',
  C: 'char',
  D: 'double',
  F: 'float',
  I: 'int',
  J: 'long',
  S: 'short',
  Z: 'boolean',
};
const PRIMITIVE_NAMES = new Set(Object.values(PRIMITIVES));
const TYPE_VARIABLE = /^[A-Z][A-Z0-9]?$/u;
const ARRAY_SUFFIX = /(?:\[\])+$/u;

const DESCRIPTOR_TYPE = /(\[*)(?:L([^;]+);|([BCDFIJSZ]))/gu;

function descriptorType([, dimensions, className, primitive]) {
  const name = className === undefined ? PRIMITIVES[primitive] : simpleClassName(className);
  return `${name}${'[]'.repeat(dimensions.length)}`;
}

export function descriptorTypes(descriptor) {
  const parameters = /^\(([^)]*)\)/u.exec(descriptor ?? '');
  return parameters === null
    ? undefined
    : [...parameters[1].matchAll(DESCRIPTOR_TYPE)].map((match) => descriptorType(match));
}

export function simpleClassName(internalName) {
  return internalName.split('/').at(-1).split('$').at(-1).replace(/^\d+/u, '');
}

function compatible(declared, actual) {
  if (declared === actual) {
    return true;
  }
  const declaredBase = declared.replace(ARRAY_SUFFIX, '');
  const actualBase = actual.replace(ARRAY_SUFFIX, '');
  return (
    TYPE_VARIABLE.test(declaredBase) &&
    declared.length - declaredBase.length === actual.length - actualBase.length &&
    !PRIMITIVE_NAMES.has(actual)
  );
}

export function sameConstructor(method, fn) {
  const actual = method.constructorTypes;
  const declared = fn.parameterTypes;
  if (actual === undefined || !Array.isArray(declared) || actual.length < declared.length) {
    return false;
  }
  const tail = actual.slice(actual.length - declared.length);
  return declared.every((type, position) => compatible(type, tail[position]));
}
