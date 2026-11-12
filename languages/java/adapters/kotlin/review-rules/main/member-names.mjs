import { pluralsOf } from '../../../../../../shared/naming/plural-names.mjs';
import { annotationNamed, bareType } from '../kotlin-facts.mjs';

export const SINGULAR_PLURAL_RULE = 'SingularAndPluralMember';

const MESSAGE = `A member and its plural (tag and tags) are two ways to pass the same data. Keep the plural and pass one item as a one-element list.`;
const CONFIGURATION_PROPERTIES = new Set(['ConfigurationProperties']);
const PERSISTENT = new Set(['Entity', 'Embeddable', 'MappedSuperclass']);
const COMPONENTS = new Set([
  'Component',
  'Service',
  'Repository',
  'Controller',
  'RestController',
  'Configuration',
]);
const HIDDEN = new Set(['private', 'protected']);
const COLLECTION =
  /^(?:kotlin\.collections\.|java\.util\.)?(?:Mutable)?(?:List|Set|Collection|Iterable|SortedSet)<(?:out)?(.+)>$/u;
const ARRAY = /^Array<(?:out)?(.+)>$/u;
const PRIMITIVE_ARRAYS = new Map(
  ['Int', 'Long', 'Short', 'Byte', 'Char', 'Boolean', 'Float', 'Double'].map((name) => [
    `${name}Array`,
    name,
  ]),
);
const NULLABLE = /\?$/u;
const OVERRIDE = 'override';
const PROTECTED = 'protected';
const CONSTRUCTOR = '<init>';

function elementOf(type) {
  const text = bareType(type);
  const element = COLLECTION.exec(text)?.[1] ?? ARRAY.exec(text)?.[1] ?? PRIMITIVE_ARRAYS.get(text);
  return element === undefined ? undefined : element.replace(NULLABLE, '');
}

function isVisibleProperty(parameter) {
  return (
    parameter.property !== undefined &&
    parameter.visibility !== undefined &&
    !HIDDEN.has(parameter.visibility)
  );
}

function isPlainValueClass(file, klass) {
  return (
    klass.kind === 'class' &&
    klass.visibility !== 'private' &&
    !annotationNamed(klass.annotations, PERSISTENT) &&
    !annotationNamed(klass.annotations, COMPONENTS) &&
    !file.functions.some(({ owner, name }) => owner === klass.qualified && name !== CONSTRUCTOR)
  );
}

function primaryMembers(file, klass, configuration) {
  if (klass.data || configuration) {
    return klass.primaryParameters.filter(({ property }) => property !== undefined);
  }
  return isPlainValueClass(file, klass) ? klass.primaryParameters.filter(isVisibleProperty) : [];
}

function bodyMembers(file, klass) {
  return file.properties
    .filter(({ owner, delegated }) => owner === klass.qualified && !delegated)
    .map(({ name, type, line }) => ({ name, type, line, vararg: false }));
}

function classMembers(file, klass, configurationClasses) {
  const configuration = configurationClasses.some(
    (qualified) => klass.qualified === qualified || klass.qualified.startsWith(`${qualified}.`),
  );
  return [
    ...primaryMembers(file, klass, configuration),
    ...(configuration ? bodyMembers(file, klass) : []),
  ];
}

function defaulted(parameters) {
  return parameters.filter((parameter) => parameter.default === true);
}

function pluralFindings(members) {
  return members
    .filter((member) => !member.vararg && elementOf(member.type) !== undefined)
    .filter((plural) =>
      members.some(
        (other) =>
          other !== plural &&
          !other.vararg &&
          pluralsOf(other.name).includes(plural.name) &&
          bareType(other.type) === elementOf(plural.type),
      ),
    );
}

function isExportedFunction(fn) {
  return (
    fn.visibility === 'public' &&
    !fn.local &&
    !fn.modifiers.includes(OVERRIDE) &&
    !fn.modifiers.includes(PROTECTED)
  );
}

function scopeOf(owner, name) {
  return owner === '' ? name : `${owner}.${name}`;
}

function classGroups(file) {
  const configurationClasses = file.classes
    .filter(({ annotations }) => annotationNamed(annotations, CONFIGURATION_PROPERTIES))
    .map(({ qualified }) => qualified);
  return file.classes.flatMap((klass) => {
    const constructor =
      klass.kind === 'class' &&
      klass.visibility === 'public' &&
      klass.constructorVisibility === 'public'
        ? [{ scope: klass.qualified, members: defaulted(klass.primaryParameters) }]
        : [];
    return [
      { scope: klass.qualified, members: classMembers(file, klass, configurationClasses) },
      ...constructor,
    ];
  });
}

function functionGroups(file) {
  return file.functions
    .filter(isExportedFunction)
    .map((fn) => ({ scope: scopeOf(fn.owner, fn.name), members: defaulted(fn.parameters) }));
}

function pluralMembers(file) {
  const found = new Map();
  const groups = [...classGroups(file), ...functionGroups(file)];
  const pairs = groups.flatMap(({ scope, members }) =>
    pluralFindings(members).map((member) => [member, `${scope}.${member.name}`]),
  );
  for (const [member, symbol] of pairs) {
    if (!found.has(member)) {
      found.set(member, symbol);
    }
  }
  return [...found];
}

export function singularPluralFindings(files, { finding }) {
  return files
    .filter(({ test }) => !test)
    .flatMap((file) =>
      pluralMembers(file).map(([member, symbol]) =>
        finding({
          rule: SINGULAR_PLURAL_RULE,
          file: file.file,
          line: member.line,
          symbol,
          message: MESSAGE,
        }),
      ),
    );
}
