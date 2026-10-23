import { ancestorsOf, hasSpringStereotype } from '../kotlin-facts.mjs';

const LIMITED = new Set(['private', 'internal']);
const SKIPPED_MODIFIERS = new Set([
  'override',
  'open',
  'abstract',
  'operator',
  'infix',
  'actual',
  'expect',
]);
const CONSTRUCTOR = '<init>';
const CALLABLE_KINDS = new Set(['class']);

function hasOptions(parameters) {
  return parameters.some(({ default: hasDefault, vararg }) => hasDefault && !vararg);
}

function plainFunction(fn) {
  return (
    fn.name !== CONSTRUCTOR &&
    fn.name !== 'main' &&
    fn.annotations.length === 0 &&
    !fn.modifiers.some((modifier) => SKIPPED_MODIFIERS.has(modifier)) &&
    fn.owner !== '<anonymous>' &&
    hasOptions(fn.parameters)
  );
}

function unitOf(file, fn, limited) {
  return {
    file: file.file,
    callee: fn.name,
    label: [fn.owner, fn.name].filter(Boolean).join('.'),
    limited,
    parameters: fn.parameters,
    line: fn.line,
  };
}

function limitedFunctionUnits(file, classes) {
  return file.functions
    .filter(
      (fn) =>
        LIMITED.has(fn.visibility) &&
        plainFunction(fn) &&
        classes.get(fn.owner)?.kind !== 'interface',
    )
    .map((fn) => unitOf(file, fn, true));
}

function isModuleLevel(owner, classes) {
  if (owner === '') {
    return true;
  }
  const kind = classes.get(owner)?.kind;
  const depth = owner.split('.').length;
  return (
    ((kind === 'object' && depth === 1) || (kind === 'companion' && depth === 2)) &&
    !ancestorsOf(owner).some((qualified) =>
      hasSpringStereotype(classes.get(qualified)?.annotations ?? []),
    )
  );
}

export function publicFunctionUnits(file) {
  const classes = new Map(file.classes.map((klass) => [klass.qualified, klass]));
  return file.functions
    .filter(
      (fn) =>
        fn.visibility === 'public' &&
        !fn.local &&
        plainFunction(fn) &&
        isModuleLevel(fn.owner, classes),
    )
    .map((fn) => unitOf(file, fn, false));
}

function eligibleClass(klass, serialization) {
  return (
    CALLABLE_KINDS.has(klass.kind) &&
    !klass.local &&
    !klass.open &&
    klass.annotations.length === 0 &&
    !(serialization && klass.data)
  );
}

function constructorUnits(file, classes, serialization) {
  const primary = file.classes
    .filter(
      (klass) =>
        eligibleClass(klass, serialization) &&
        (LIMITED.has(klass.visibility) || LIMITED.has(klass.constructorVisibility)) &&
        hasOptions(klass.primaryParameters),
    )
    .map((klass) => ({
      file: file.file,
      callee: klass.name,
      label: klass.qualified,
      limited: true,
      data: klass.data,
      parameters: klass.primaryParameters,
      line: klass.line,
    }));
  const secondary = file.functions
    .filter(
      (fn) => fn.name === CONSTRUCTOR && LIMITED.has(fn.visibility) && hasOptions(fn.parameters),
    )
    .filter((fn) => classes.has(fn.owner) && eligibleClass(classes.get(fn.owner), serialization))
    .map((fn) => ({
      file: file.file,
      callee: classes.get(fn.owner).name,
      label: fn.owner,
      limited: true,
      data: false,
      parameters: fn.parameters,
      line: fn.line,
    }));
  return [...primary, ...secondary];
}

export function limitedUnits(file, serialization) {
  const classes = new Map(file.classes.map((klass) => [klass.qualified, klass]));
  return [
    ...limitedFunctionUnits(file, classes),
    ...constructorUnits(file, classes, serialization),
  ];
}
