import { insideClass } from '../kotlin-facts.mjs';

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

function inAnnotatedClass(owner, classes) {
  return [...classes.values()].some(
    (klass) => klass.annotations.length > 0 && insideClass(owner, klass.qualified),
  );
}

function judgedFunction(fn, classes) {
  return (
    fn.name !== CONSTRUCTOR &&
    fn.name !== 'main' &&
    fn.annotations.length === 0 &&
    !fn.modifiers.some((modifier) => SKIPPED_MODIFIERS.has(modifier)) &&
    fn.owner !== '<anonymous>' &&
    classes.get(fn.owner)?.kind !== 'interface' &&
    hasOptions(fn.parameters) &&
    (LIMITED.has(fn.visibility) || !inAnnotatedClass(fn.owner, classes))
  );
}

function functionUnits(file, classes) {
  return file.functions
    .filter((fn) => judgedFunction(fn, classes))
    .map((fn) => ({
      file: file.file,
      callee: fn.name,
      label: [fn.owner, fn.name].filter(Boolean).join('.'),
      limited: LIMITED.has(fn.visibility),
      parameters: fn.parameters,
      line: fn.line,
    }));
}

function serializedShape(klass, serialization) {
  return (
    serialization &&
    (klass.data || klass.primaryParameters.every(({ property }) => typeof property === 'string'))
  );
}

function eligibleClass(klass) {
  return (
    CALLABLE_KINDS.has(klass.kind) &&
    !klass.local &&
    !klass.open &&
    klass.annotations.length === 0 &&
    (klass.constructorAnnotations ?? []).length === 0
  );
}

function primaryUnit(file, klass, serialization) {
  const limited = LIMITED.has(klass.visibility) || LIMITED.has(klass.constructorVisibility);
  const skipped = limited ? serialization && klass.data : serializedShape(klass, serialization);
  if (!eligibleClass(klass) || skipped || !hasOptions(klass.primaryParameters)) {
    return [];
  }
  return [
    {
      file: file.file,
      callee: klass.name,
      label: klass.qualified,
      limited,
      data: klass.data,
      parameters: klass.primaryParameters,
      line: klass.line,
    },
  ];
}

function secondaryUnits(file, classes, serialization) {
  return file.functions
    .filter(
      (fn) =>
        fn.name === CONSTRUCTOR &&
        fn.annotations.length === 0 &&
        hasOptions(fn.parameters) &&
        classes.has(fn.owner),
    )
    .filter((fn) => {
      const klass = classes.get(fn.owner);
      return eligibleClass(klass) && !(serialization && klass.data);
    })
    .map((fn) => ({
      file: file.file,
      callee: classes.get(fn.owner).name,
      label: fn.owner,
      limited: LIMITED.has(fn.visibility),
      data: false,
      parameters: fn.parameters,
      line: fn.line,
    }));
}

export function optionUnits(file, serialization) {
  const classes = new Map(file.classes.map((klass) => [klass.qualified, klass]));
  return [
    ...functionUnits(file, classes),
    ...file.classes.flatMap((klass) => primaryUnit(file, klass, serialization)),
    ...secondaryUnits(file, classes, serialization),
  ];
}
