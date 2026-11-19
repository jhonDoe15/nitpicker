import type { CoverageUnit, FunctionUnit } from '../units/unit-types.mts';

const PRIMITIVES: Readonly<Record<string, string | undefined>> = {
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

function descriptorType([, dimensions, className, primitive]: RegExpMatchArray): string {
  const name = className === undefined ? PRIMITIVES[primitive ?? ''] : simpleClassName(className);
  return `${String(name)}${'[]'.repeat((dimensions ?? '').length)}`;
}

export function descriptorTypes(descriptor: string | undefined): string[] | undefined {
  const parameters = /^\(([^)]*)\)/u.exec(descriptor ?? '');
  return parameters === null
    ? undefined
    : [...(parameters[1] ?? '').matchAll(DESCRIPTOR_TYPE)].map((match) => descriptorType(match));
}

export function simpleClassName(internalName: string): string {
  return (internalName.split('/').at(-1) ?? '').split('$').at(-1)?.replace(/^\d+/u, '') ?? '';
}

export function sameConstructor(
  method: Pick<CoverageUnit, 'constructorTypes'>,
  fn: Pick<FunctionUnit, 'parameterTypes'>,
): boolean {
  const actual = method.constructorTypes;
  const declared = fn.parameterTypes;
  if (actual === undefined || !Array.isArray(declared) || actual.length < declared.length) {
    return false;
  }
  const tail = actual.slice(actual.length - declared.length);
  return declared.every((type: unknown, position: number) => type === tail[position]);
}
