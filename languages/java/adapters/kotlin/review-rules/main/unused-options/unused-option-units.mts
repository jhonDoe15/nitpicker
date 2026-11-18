import type {
  ClassFact,
  FunctionFact,
  KotlinFile,
  ParameterFact,
} from '../../typed/kotlin-fact-types.mts';
import type { OptionUnit } from './unused-option-sites.mts';
import { springManagedOwner } from '../../spring/spring-names.mts';
import { declarationOf, functionKind } from './call-reach.mts';

const PRIVATE = 'private';
const INTERNAL = 'internal';
const LIMITED = new Set([PRIVATE, INTERNAL]);
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
function classIndex(file: KotlinFile): Map<string, ClassFact> {
  return new Map(file.classes.map((klass): [string, ClassFact] => [klass.qualified, klass]));
}

const CALLABLE_KINDS = new Set(['class']);

function hasOptions(parameters: ParameterFact[]): boolean {
  return parameters.some(({ default: hasDefault, vararg }) => hasDefault && !vararg);
}

function plainFunction(fn: FunctionFact): boolean {
  return (
    fn.name !== CONSTRUCTOR &&
    fn.name !== 'main' &&
    (fn.annotations ?? []).length === 0 &&
    !fn.modifiers.some((modifier) => SKIPPED_MODIFIERS.has(modifier)) &&
    fn.owner !== '<anonymous>' &&
    hasOptions(fn.parameters)
  );
}

function unitOf(file: KotlinFile, fn: FunctionFact, limited: boolean): OptionUnit {
  return {
    file: file.file,
    callee: fn.name,
    label: [fn.owner, fn.name].filter(Boolean).join('.'),
    limited,
    internal: fn.visibility === INTERNAL,
    data: false,
    parameters: fn.parameters,
    line: fn.line,
    declaration: declarationOf(file, {
      owner: fn.owner,
      name: fn.name,
      kind: functionKind(file, fn.owner),
      extension: fn.receiver !== undefined,
    }),
  };
}

function limitedFunctionUnits(file: KotlinFile, classes: Map<string, ClassFact>): OptionUnit[] {
  return file.functions
    .filter(
      (fn) =>
        LIMITED.has(fn.visibility ?? '') &&
        plainFunction(fn) &&
        classes.get(fn.owner)?.kind !== 'interface',
    )
    .map((fn) => unitOf(file, fn, true));
}

function isModuleLevel(
  owner: string,
  classes: Map<string, ClassFact>,
  managed: (owner: string) => boolean,
): boolean {
  if (owner === '') {
    return true;
  }
  const kind = classes.get(owner)?.kind;
  const depth = owner.split('.').length;
  return (
    ((kind === 'object' && depth === 1) || (kind === 'companion' && depth === 2)) && !managed(owner)
  );
}

export function publicFunctionUnits(file: KotlinFile, declared: Set<string>): OptionUnit[] {
  const classes = classIndex(file);
  const managed = springManagedOwner(file, declared);
  return file.functions
    .filter(
      (fn) =>
        fn.visibility === 'public' &&
        !fn.local &&
        plainFunction(fn) &&
        isModuleLevel(fn.owner, classes, managed),
    )
    .map((fn) => unitOf(file, fn, false));
}

function eligibleClass(klass: ClassFact, serialization: boolean): boolean {
  return (
    CALLABLE_KINDS.has(klass.kind) &&
    !klass.local &&
    !klass.open &&
    klass.annotations.length === 0 &&
    !(serialization && klass.data)
  );
}

function primaryUnits(file: KotlinFile, serialization: boolean): OptionUnit[] {
  return file.classes
    .filter(
      (klass) =>
        eligibleClass(klass, serialization) &&
        (LIMITED.has(klass.visibility ?? '') || LIMITED.has(klass.constructorVisibility ?? '')) &&
        hasOptions(klass.primaryParameters),
    )
    .map((klass) => ({
      file: file.file,
      callee: klass.name,
      label: klass.qualified,
      limited: true,
      internal: klass.visibility !== PRIVATE && klass.constructorVisibility !== PRIVATE,
      data: klass.data,
      parameters: klass.primaryParameters,
      line: klass.line,
      declaration: declarationOf(file, {
        owner: klass.qualified,
        name: klass.name,
        kind: 'constructor',
        extension: false,
      }),
    }));
}

function secondaryUnits(
  file: KotlinFile,
  classes: Map<string, ClassFact>,
  serialization: boolean,
): OptionUnit[] {
  return file.functions
    .filter(
      (fn) =>
        fn.name === CONSTRUCTOR && LIMITED.has(fn.visibility ?? '') && hasOptions(fn.parameters),
    )
    .flatMap((fn) => {
      const owner = classes.get(fn.owner);
      if (owner === undefined || !eligibleClass(owner, serialization)) {
        return [];
      }
      return [
        {
          file: file.file,
          callee: owner.name,
          label: fn.owner,
          limited: true,
          internal: fn.visibility === INTERNAL && owner.visibility !== PRIVATE,
          data: false,
          parameters: fn.parameters,
          line: fn.line,
          declaration: declarationOf(file, {
            owner: fn.owner,
            name: fn.name,
            kind: 'constructor',
            extension: false,
          }),
        },
      ];
    });
}

function constructorUnits(
  file: KotlinFile,
  classes: Map<string, ClassFact>,
  serialization: boolean,
): OptionUnit[] {
  return [...primaryUnits(file, serialization), ...secondaryUnits(file, classes, serialization)];
}

export function limitedUnits(file: KotlinFile, serialization: boolean): OptionUnit[] {
  const classes = classIndex(file);
  return [
    ...limitedFunctionUnits(file, classes),
    ...constructorUnits(file, classes, serialization),
  ];
}
