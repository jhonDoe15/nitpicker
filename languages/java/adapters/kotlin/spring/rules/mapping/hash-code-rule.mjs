import { descendants, textOf } from '../../syntax/kotlin-tree.mjs';
import { ENTITY_OR_SUPERCLASS, GENERATED_VALUE } from '../../names/spring-annotations.mjs';
import { annotationOn, classSymbolOf, defineRule, hasAnnotation, hitOn } from '../rule-support.mjs';

function getterName(name) {
  return `get${name.charAt(0).toUpperCase()}${name.slice(1)}`;
}

function idReference(file, hashCode, ids) {
  const names = new Set([...ids, ...ids.map(getterName)]);
  return descendants(
    hashCode.body,
    (node) => node.t === 'REFERENCE_EXPRESSION' && names.has(textOf(file.source, node)),
  )[0];
}

function explicitHash(file, declaration, ids) {
  const hashCode = declaration.functions.find(
    (member) =>
      member.name === 'hashCode' && member.params.length === 0 && member.body !== undefined,
  );
  const reference = hashCode === undefined ? undefined : idReference(file, hashCode, ids);
  return reference === undefined
    ? []
    : [hitOn(reference, `${classSymbolOf(declaration)}.hashCode`)];
}

function generatedHash(file, declaration, entity) {
  const hasHashCode = declaration.functions.some(
    (member) => member.name === 'hashCode' && member.params.length === 0,
  );
  const inConstructor = declaration.properties.some(
    (property) => property.fromConstructor && hasAnnotation(file, property, GENERATED_VALUE),
  );
  return declaration.modifiers.has('data') && !hasHashCode && inConstructor
    ? [hitOn(entity.node, `${classSymbolOf(declaration)}.hashCode`)]
    : [];
}

const identityHashCode = defineRule(
  'JpaIdentityHashCode',
  'Return javaClass.hashCode() from the hashCode of an entity, or hash an immutable business key. A hash of the generated id or of every constructor property, as a data class generates, changes when the entity is saved, and a hash set then loses it.',
  (file) =>
    file.classes.flatMap((declaration) => {
      const entity = annotationOn(file, declaration, ENTITY_OR_SUPERCLASS);
      if (entity === undefined) {
        return [];
      }
      const ids = declaration.properties
        .filter((property) => hasAnnotation(file, property, GENERATED_VALUE))
        .map((property) => property.name);
      return ids.length === 0
        ? []
        : [...explicitHash(file, declaration, ids), ...generatedHash(file, declaration, entity)];
    }),
);

export const HASH_CODE_RULES = [identityHashCode];
