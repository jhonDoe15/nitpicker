import { argumentValue } from '../../syntax/kotlin-annotations.mjs';
import { typeMatches } from '../../syntax/kotlin-receivers.mjs';
import {
  CONVERTER,
  ELEMENT_COLLECTION,
  ENTITY_OR_EMBEDDABLE,
  ENUM_OPT_OUTS,
  ENUMERATED,
  IDENTIFIERS,
  MAP_KEY_ENUMERATED,
} from '../../names/spring-annotations.mjs';
import { MAP_TYPES } from '../../names/spring-body-types.mjs';
import { annotationOn, classSymbolOf, defineRule, hasAnnotation, hitOn } from '../rule-support.mjs';

const CONVERTER_INTERFACE = /(?:^|\.)AttributeConverter$/;

function usesStringMapping(file, property, names) {
  return annotationOn(file, property, names)?.args.some(({ text }) => text.includes('STRING'));
}

function propertyAccess(file, declaration) {
  return declaration.properties.some((property) =>
    property.annotations.some(
      (annotation) =>
        file.resolver.matches(annotation.name, IDENTIFIERS) && annotation.target.startsWith('get'),
    ),
  );
}

function convertedEnums(file) {
  return new Set(
    file.classes
      .filter((declaration) => {
        const converter = declaration.annotations.find((annotation) =>
          file.resolver.matches(annotation.name, CONVERTER),
        );
        return converter !== undefined && argumentValue(converter, 'autoApply')?.text === 'true';
      })
      .flatMap((declaration) => declaration.supertypes)
      .filter(({ type }) => CONVERTER_INTERFACE.test(type.name))
      .map(({ type }) => type.args[0]?.name),
  );
}

function enumNodes(file, property, project) {
  const { type } = property;
  if (type === undefined) {
    return [];
  }
  const isEnum = (candidate) =>
    typeMatches(file, candidate, project.enumTypes) && candidate !== undefined;
  const string = usesStringMapping(file, property, ENUMERATED);
  if (!hasAnnotation(file, property, ELEMENT_COLLECTION)) {
    return !string && isEnum(type) ? [type] : [];
  }
  if (file.resolver.matches(type.name, MAP_TYPES)) {
    const [key, value] = type.args;
    return [
      ...(!usesStringMapping(file, property, MAP_KEY_ENUMERATED) && isEnum(key) ? [key] : []),
      ...(!string && isEnum(value) ? [value] : []),
    ];
  }
  return !string && isEnum(type.args[0]) ? [type.args[0]] : [];
}

const enumString = defineRule(
  'JpaEnumString',
  'Write @Enumerated(EnumType.STRING) on this enum property or element collection, and @MapKeyEnumerated(EnumType.STRING) on a map with enum keys. The default stores the ordinal, so adding or reordering constants silently corrupts stored rows.',
  (file, project) => {
    const converted = convertedEnums(file);
    return file.classes
      .filter((declaration) => hasAnnotation(file, declaration, ENTITY_OR_EMBEDDABLE))
      .filter((declaration) => !propertyAccess(file, declaration))
      .flatMap((declaration) =>
        declaration.properties
          .filter(
            (property) => !property.delegated && !hasAnnotation(file, property, ENUM_OPT_OUTS),
          )
          .flatMap((property) =>
            enumNodes(file, property, project)
              .filter((type) => !converted.has(type.name))
              .map((type) => hitOn(type.node, `${classSymbolOf(declaration)}.${property.name}`)),
          ),
      );
  },
);

export const ENUM_STRING_RULES = [enumString];
