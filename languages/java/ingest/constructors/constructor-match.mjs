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

export function sameConstructor(method, fn) {
  const actual = method.constructorTypes;
  const declared = fn.parameterTypes;
  if (actual === undefined || !Array.isArray(declared) || actual.length < declared.length) {
    return false;
  }
  const tail = actual.slice(actual.length - declared.length);
  return declared.every((type, position) => type === tail[position]);
}
