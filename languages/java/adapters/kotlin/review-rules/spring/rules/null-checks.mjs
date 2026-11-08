import { ancestorsOf, compactType } from '../../kotlin-facts.mjs';
import { annotationIn, typeName } from '../spring-names.mjs';
import { entriesOf, symbolOf } from '../spring-scopes.mjs';
import { CONFIGURATION_PROPERTIES, VALUE } from '../spring-types.mjs';
import { lastSelector } from '../view/expressions.mjs';
import { membersOfClass } from '../view/project-types.mjs';

const RULE = 'SpringNullOnlyConfigCheck';
const NULLABLE_STRING = new Set(['String?', 'kotlin.String?', 'java.lang.String?']);
const GUARDS = new Set(['let', 'also', 'run', 'apply']);
const HARMLESS_FALLBACKS = new Set(['""', 'null']);
const MEASURES =
  '(?:isNotBlank|isNotEmpty|isBlank|isEmpty|isNullOrBlank|isNullOrEmpty|ifBlank|ifEmpty|length|trim)';

function escaped(text) {
  return text.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);
}

function testsEmptiness(condition, subject) {
  const name = escaped(subject);
  return new RegExp(
    String.raw`${name}\s*\??\.\s*${MEASURES}\b|(?:hasText|hasLength)\(\s*${name}\s*\)|${name}\s*[!=]=\s*""|""\s*[!=]=\s*${name}`,
    'u',
  ).test(condition ?? '');
}

function isNullableString(entry) {
  return entry !== undefined && NULLABLE_STRING.has(compactType(entry.type));
}

function qualifiedIn(file, qualified) {
  return [file.package, qualified].filter(Boolean).join('.');
}

function boundClass(view, file, qualified) {
  return ancestorsOf(qualified).some((owner) =>
    view.metaAnnotated(qualifiedIn(file, owner), CONFIGURATION_PROPERTIES),
  );
}

function ownMember(view, scope, name) {
  const declared = view.classAt(scope);
  if (declared === undefined || view.declaresLocally(scope, name)) {
    return undefined;
  }
  const entry = membersOfClass({ file: view.file, declared }).find(
    (member) => member.name === name,
  );
  const valued = annotationIn(view.resolve, entriesOf(entry ?? {}), VALUE) !== undefined;
  return isNullableString(entry) && (valued || boundClass(view, view.file, declared.qualified))
    ? `${declared.qualified}.${name}`
    : undefined;
}

function valueParameter(view, scope, name) {
  const parameter = view.functionAt(scope)?.parameters.find((entry) => entry.name === name);
  return isNullableString(parameter) &&
    annotationIn(view.resolve, entriesOf(parameter), VALUE) !== undefined
    ? name
    : undefined;
}

function classOf(view, scope, text) {
  const heads = [text];
  for (const head of heads) {
    const split = lastSelector(head);
    heads.push(...(split === undefined ? [] : [split.head]));
  }
  return heads.toReversed().reduce((outer, head) => {
    const type = typeName(view.typeOf(scope, head) ?? '');
    const nested =
      outer === undefined
        ? undefined
        : view.projectClass(qualifiedIn(outer.file, `${outer.declared.qualified}.${type}`));
    return (type === '' ? undefined : view.projectClass(type)) ?? nested;
  }, undefined);
}

function memberOfType(view, scope, { head, selector: name }) {
  const found = classOf(view, scope, head);
  const entry =
    found === undefined ? undefined : membersOfClass(found).find((member) => member.name === name);
  return isNullableString(entry) && boundClass(view, found.file, found.declared.qualified)
    ? `${found.declared.qualified}.${name}`
    : undefined;
}

function configString(view, scope, subject) {
  const split = lastSelector(subject);
  if (split === undefined || split.head === 'this') {
    const name = split?.selector ?? subject;
    return (
      ownMember(view, scope, name) ??
      (split === undefined ? valueParameter(view, scope, name) : undefined)
    );
  }
  return memberOfType(view, scope, split);
}

function nullTestFindings(view) {
  return (view.file.nullTests ?? [])
    .filter(({ operator, fallback }) => operator !== '?:' || !HARMLESS_FALLBACKS.has(fallback))
    .filter(({ condition, subject }) => !testsEmptiness(condition, subject))
    .flatMap(({ line, scope, subject }) =>
      configString(view, scope, subject) === undefined
        ? []
        : [{ rule: RULE, line, symbol: symbolOf(view, scope, subject) }],
    );
}

function guardFindings(view) {
  return view.file.invocations
    .filter(({ name, safe, statement }) => GUARDS.has(name) && safe === true && statement === true)
    .filter(
      ({ receiver, scope }) =>
        receiver !== undefined && configString(view, scope, receiver) !== undefined,
    )
    .map(({ line, scope, receiver }) => ({
      rule: RULE,
      line,
      symbol: symbolOf(view, scope, receiver),
    }));
}

export function nullOnlyConfigChecks(view) {
  return [...nullTestFindings(view), ...guardFindings(view)];
}
