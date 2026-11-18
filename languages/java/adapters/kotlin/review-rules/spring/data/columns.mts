import { annotationIn, typeArguments, typeName } from '../spring-names.mts';
import { entriesOf, factoryType, report } from '../spring-scopes.mts';
import {
  COLUMN_HOLDERS,
  ELEMENT_COLLECTION,
  ENTITY_CLASSES,
  ENUMERATED,
  GENERATED_VALUE,
  JDK_ENUMS,
  MAP_KEY_ENUMERATED,
  NOT_COLUMNS,
} from './data-types.mts';
import { simpleName } from '../view/member-types.mts';
import { annotatedWith, membersOf } from './entities.mts';
import { appendAll } from '../../../../../../../shared/lists/items.mjs';
import type {
  ClassFact,
  Declaration,
  Fqns,
  FunctionFact,
  Member,
  Reported,
  RuleOptions,
  SourceFile,
  SpringView,
} from '../typed/spring-shapes.mts';

const STRING = /\bSTRING\b/u;
const MAPS = new Set(['Map', 'MutableMap', 'HashMap', 'LinkedHashMap', 'SortedMap', 'TreeMap']);
const AUTO_APPLY = /^autoApply$/u;
const CONVERTER_DEPTH = 4;

type EnumContext = { enums: Set<string>; converted: Set<string | undefined>; owner: string };

function projectEnums(projectFiles: SourceFile[]): Set<string> {
  return new Set(
    projectFiles.flatMap((file) =>
      file.classes
        .filter(({ kind }) => kind === 'enum')
        .map(({ qualified }) => [file.package, qualified].filter(Boolean).join('.')),
    ),
  );
}

function autoApply(declared: ClassFact): boolean {
  return declared.annotations.some(
    (annotation) =>
      simpleName(annotation.type ?? annotation.name) === 'Converter' &&
      annotation.arguments.some(
        ({ name, text }) => (name === undefined || AUTO_APPLY.test(name)) && text === 'true',
      ),
  );
}

function directConverter(declared: ClassFact | undefined): string | undefined {
  return (declared?.genericSupers ?? []).find((text) => simpleName(text) === 'AttributeConverter');
}

function basesOf(classes: Map<string, ClassFact>, declared: ClassFact | undefined): ClassFact[] {
  return (declared?.supers ?? [])
    .map((text) => classes.get(simpleName(text)))
    .filter((base): base is ClassFact => base !== undefined && base !== declared);
}

function passedDown(
  type: string | undefined,
  base: ClassFact | undefined,
  child: ClassFact,
): string | undefined {
  const index =
    type === undefined
      ? -1
      : (base?.typeBounds ?? []).findIndex(({ name }) => name === typeName(type));
  if (index < 0) {
    return type;
  }
  const written = (child.genericSupers ?? []).find(
    (text) => simpleName(text) === simpleName(base?.name),
  );
  return written === undefined ? undefined : typeArguments(written)[index];
}

function typeAlong(path: ClassFact[]): string | undefined {
  return path
    .slice(0, -1)
    .reduceRight<string | undefined>(
      (type, child, index) => passedDown(type, path[index + 1], child),
      typeArguments(directConverter(path.at(-1)))[0],
    );
}

function convertedType(classes: Map<string, ClassFact>, declared: ClassFact): string | undefined {
  const paths: ClassFact[][] = [[declared]];
  for (const path of paths) {
    const last = path.at(-1);
    const type = directConverter(last) === undefined ? undefined : typeAlong(path);
    if (type !== undefined) {
      return type;
    }
    if (directConverter(last) === undefined && path.length <= CONVERTER_DEPTH) {
      appendAll(
        paths,
        basesOf(classes, last)
          .filter((base) => !path.includes(base))
          .map((base) => [...path, base]),
      );
    }
  }
  return undefined;
}

function autoApplied(view: SpringView, projectFiles: SourceFile[]): Set<string | undefined> {
  const declared = projectFiles.flatMap((file) => file.classes);
  const classes = new Map(declared.map((entry) => [entry.name, entry]));
  return new Set([
    ...view.javaConverted(),
    ...declared
      .filter((entry) => autoApply(entry))
      .map((entry) => convertedType(classes, entry))
      .filter((type) => type !== undefined)
      .map((type) => simpleName(type)),
  ]);
}

function inferredType(member: Member): string | undefined {
  if (member.type !== undefined) {
    return member.type;
  }
  const factory = factoryType(member.initializer);
  return factory !== undefined && member.initializerTypeArguments !== undefined
    ? `${factory}${member.initializerTypeArguments}`
    : member.initializerQualifier;
}

function stored(view: SpringView, member: Declaration, fqns: Fqns): boolean {
  return entriesOf(member).some(
    (entry) =>
      view.is(entry.type ?? entry.name, fqns) &&
      entry.arguments.some(({ text }) => STRING.test(text)),
  );
}

function enclosingCandidates(view: SpringView, owner: string, name: string): string[] {
  const parts = owner.split('.');
  return parts
    .map((_, index) => parts.slice(0, parts.length - index).join('.'))
    .map((prefix) => [view.file.package, prefix, name].filter(Boolean).join('.'));
}

function isEnumType(view: SpringView, context: EnumContext, type: string | undefined): boolean {
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

function enumColumns(view: SpringView, member: Member, context: EnumContext): string[] {
  const isEnum = isEnumType.bind(undefined, view, context);
  const string = stored(view, member, ENUMERATED);
  const type = inferredType(member);
  if (annotatedWith(view, member, ELEMENT_COLLECTION) === undefined) {
    return isEnum(type) && !string ? ['value'] : [];
  }
  const [first, second] = typeArguments(type);
  if (!MAPS.has(simpleName(type))) {
    return isEnum(first) && !string ? ['value'] : [];
  }
  return [
    ...(isEnum(first) && !stored(view, member, MAP_KEY_ENUMERATED) ? ['key'] : []),
    ...(isEnum(second) && !string ? ['value'] : []),
  ];
}

function holders(view: SpringView, fqns: Fqns): ClassFact[] {
  return view.file.classes.filter(
    (declared) => annotationIn(view.resolve, declared.annotations, fqns) !== undefined,
  );
}

function enumStrings(view: SpringView, { projectFiles }: RuleOptions): Reported[] {
  const context = { enums: projectEnums(projectFiles), converted: autoApplied(view, projectFiles) };
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

function readsOf(view: SpringView, fn: FunctionFact): string[] {
  return (
    view.file.scopes.find(
      ({ k, name, line }) => k === 'fun' && name === fn.name && line === fn.line,
    )?.reads ?? []
  );
}

function identityHashes(view: SpringView, declared: ClassFact): Reported[] {
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

function hashCodes(view: SpringView): Reported[] {
  return holders(view, ENTITY_CLASSES).flatMap((declared) => identityHashes(view, declared));
}

export const COLUMN_RULES = [enumStrings, hashCodes];
