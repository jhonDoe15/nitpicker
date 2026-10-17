import { annotationNamed } from '../kotlin-facts.mjs';
import { exceptionSentence } from '../review-finding.mjs';

export const SINGULAR_PLURAL_RULE = 'SingularAndPluralMember';

const MESSAGE = `A member and its plural (tag and tags) are two ways to pass the same data. Keep the plural and pass one item as a one-element list. If both are intended, ${exceptionSentence(SINGULAR_PLURAL_RULE)}`;
const CONFIGURATION_PROPERTIES = new Set(['ConfigurationProperties']);
const COLLECTION = /^(?:kotlin\.collections\.|java\.util\.)?(?:Mutable)?(?:List|Set|Collection|Iterable|SortedSet)<(?:out)?(.+)>$/u;
const ARRAY = /^Array<(?:out)?(.+)>$/u;
const PRIMITIVE_ARRAYS = new Map(
  ['Int', 'Long', 'Short', 'Byte', 'Char', 'Boolean', 'Float', 'Double'].map((name) => [`${name}Array`, name]),
);
const NULLABLE = /\?$/u;

function normalized(type) {
  return (type ?? '').replaceAll(/\s+/gu, '').replace(NULLABLE, '');
}

function elementOf(type) {
  const text = normalized(type);
  const element = COLLECTION.exec(text)?.[1] ?? ARRAY.exec(text)?.[1] ?? PRIMITIVE_ARRAYS.get(text);
  return element === undefined ? undefined : element.replace(NULLABLE, '');
}

function pluralsOf(name) {
  return [
    `${name}s`,
    `${name}es`,
    ...(/[^aeiou]y$/u.test(name) ? [`${name.slice(0, -1)}ies`] : []),
  ];
}

function membersOf(file, klass, configuration) {
  const parameters = klass.primaryParameters
    .filter(({ property }) => property !== null)
    ;
  const properties = configuration
    ? file.properties
        .filter(({ owner, delegated }) => owner === klass.qualified && !delegated)
        .map(({ name, type, line }) => ({ name, type, line, vararg: false }))
    : [];
  return [...parameters, ...properties];
}

function inspected(file, klass, configurationClasses) {
  const configuration = configurationClasses.some(
    (qualified) => klass.qualified === qualified || klass.qualified.startsWith(`${qualified}.`),
  );
  return klass.data || configuration ? membersOf(file, klass, configuration) : [];
}

function pluralFindings(members) {
  return members
    .filter((member) => !member.vararg && elementOf(member.type) !== undefined)
    .filter((plural) =>
      members.some(
        (other) =>
          other !== plural &&
          pluralsOf(other.name).includes(plural.name) &&
          normalized(other.type) === elementOf(plural.type),
      ),
    );
}

export function singularPluralFindings(files, { finding }) {
  return files
    .filter(({ test }) => !test)
    .flatMap((file) => {
      const configurationClasses = file.classes
        .filter(({ annotations }) => annotationNamed(annotations, CONFIGURATION_PROPERTIES))
        .map(({ qualified }) => qualified);
      return file.classes.flatMap((klass) =>
        pluralFindings(inspected(file, klass, configurationClasses)).map((member) =>
          finding({
            rule: SINGULAR_PLURAL_RULE,
            file: file.file,
            line: member.line,
            symbol: `${klass.qualified}.${member.name}`,
            message: MESSAGE,
          }),
        ),
      );
    });
}
