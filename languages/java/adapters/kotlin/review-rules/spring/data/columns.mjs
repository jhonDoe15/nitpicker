import { annotationIn, typeArguments, typeName } from '../spring-names.mjs';
import { entriesOf, report } from '../spring-scopes.mjs';
import {
  COLUMN_HOLDERS,
  ELEMENT_COLLECTION,
  ENTITY_CLASSES,
  ENUMERATED,
  GENERATED_VALUE,
  JDK_ENUMS,
  MAP_KEY_ENUMERATED,
  NOT_COLUMNS,
} from './data-types.mjs';
import { annotatedWith, membersOf } from './entities.mjs';

const STRING = /\bSTRING\b/u;
const MAPS = new Set(['Map', 'MutableMap', 'HashMap', 'LinkedHashMap', 'SortedMap', 'TreeMap']);
const AUTO_APPLY = /^autoApply$/u;

function simpleName(type) {
  return typeName(type).split('.').at(-1);
}

function projectEnums(projectFiles) {
  return new Set(
    projectFiles.flatMap((file) =>
      file.classes
        .filter(({ kind }) => kind === 'enum')
        .map(({ qualified }) => [file.package, qualified].filter(Boolean).join('.')),
    ),
  );
}

function autoApplied(projectFiles) {
  return new Set(
    projectFiles
      .flatMap((file) => file.classes)
      .filter((declared) =>
        declared.annotations.some(
          (annotation) =>
            simpleName(annotation.type ?? annotation.name) === 'Converter' &&
            annotation.arguments.some(
              ({ name, text }) => AUTO_APPLY.test(name ?? '') && text === 'true',
            ),
        ),
      )
      .flatMap((declared) => declared.genericSupers ?? [])
      .filter((text) => simpleName(text) === 'AttributeConverter')
      .map((text) => simpleName(typeArguments(text)[0])),
  );
}

function stored(view, member, fqns) {
  return entriesOf(member).some(
    (entry) =>
      view.is(entry.type ?? entry.name, fqns) &&
      entry.arguments.some(({ text }) => STRING.test(text)),
  );
}

function enclosingCandidates(view, owner, name) {
  const parts = owner.split('.');
  return parts
    .map((_, index) => parts.slice(0, parts.length - index).join('.'))
    .map((prefix) => [view.file.package, prefix, name].filter(Boolean).join('.'));
}

function isEnumType(view, context, type) {
  if (type === undefined || context.converted.has(simpleName(type))) {
    return false;
  }
  const name = typeName(type);
  const candidates = [...enclosingCandidates(view, context.owner, name), ...view.resolve(name)];
  return (
    candidates.some((candidate) => context.enums.has(candidate) || JDK_ENUMS.has(candidate)) ||
    view.isJavaEnum([[view.file.package, name].filter(Boolean).join('.'), ...view.resolve(name)])
  );
}

function enumColumns(view, member, context) {
  const isEnum = isEnumType.bind(undefined, view, context);
  const string = stored(view, member, ENUMERATED);
  if (annotatedWith(view, member, ELEMENT_COLLECTION) === undefined) {
    return isEnum(member.type) && !string ? ['value'] : [];
  }
  const [first, second] = typeArguments(member.type);
  if (!MAPS.has(simpleName(member.type))) {
    return isEnum(first) && !string ? ['value'] : [];
  }
  return [
    ...(isEnum(first) && !stored(view, member, MAP_KEY_ENUMERATED) ? ['key'] : []),
    ...(isEnum(second) && !string ? ['value'] : []),
  ];
}

function holders(view, fqns) {
  return view.file.classes.filter(
    (declared) => annotationIn(view.resolve, declared.annotations, fqns) !== undefined,
  );
}

function enumStrings(view, { projectFiles }) {
  const context = { enums: projectEnums(projectFiles), converted: autoApplied(projectFiles) };
  return holders(view, COLUMN_HOLDERS).flatMap((declared) =>
    membersOf(view, declared)
      .filter((member) => annotatedWith(view, member, NOT_COLUMNS) === undefined)
      .flatMap((member) =>
        enumColumns(view, member, { ...context, owner: declared.qualified }).map((part) => ({
          ...report('JpaEnumString', member, `${declared.qualified}.${member.name}`),
          key: `${declared.qualified}.${member.name}:${part}`,
        })),
      ),
  );
}

function readsOf(view, fn) {
  return (
    view.file.scopes.find(
      ({ k, name, line }) => k === 'fun' && name === fn.name && line === fn.line,
    )?.reads ?? []
  );
}

function identityHashes(view, declared) {
  const generated = membersOf(view, declared)
    .filter((member) => annotatedWith(view, member, GENERATED_VALUE) !== undefined)
    .map(({ name }) => name);
  if (generated.length === 0) {
    return [];
  }
  const hashCode = view
    .functionsOf(declared.qualified)
    .find(({ name, parameters }) => name === 'hashCode' && parameters.length === 0);
  if (hashCode === undefined) {
    const inData = declared.primaryParameters.some(({ name }) => generated.includes(name));
    return declared.data && inData
      ? [report('JpaIdentityHashCode', declared, declared.qualified)]
      : [];
  }
  return readsOf(view, hashCode).some((name) => generated.includes(name))
    ? [report('JpaIdentityHashCode', hashCode, `${declared.qualified}.hashCode`)]
    : [];
}

function hashCodes(view) {
  return holders(view, ENTITY_CLASSES).flatMap((declared) => identityHashes(view, declared));
}

export const COLUMN_RULES = [enumStrings, hashCodes];
