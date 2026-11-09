import { ancestorsOf, compactType } from '../../../kotlin-facts.mjs';
import { annotationIn, typeName } from '../../spring-names.mjs';
import { entriesOf, symbolOf } from '../../spring-scopes.mjs';
import { CONFIGURATION_PROPERTIES, PROPERTY_RESOLVERS, VALUE } from '../../spring-types.mjs';
import { lastSelector } from '../../view/expressions.mjs';
import { membersOfClass } from '../../view/project-types.mjs';
import { stereotype } from './configuration.mjs';

const RULE = 'SpringNullOnlyConfigCheck';
const NULLABLE_STRING = new Set(['String?', 'kotlin.String?', 'java.lang.String?']);
const GUARDS = new Set(['let', 'also', 'run', 'apply']);
const HARMLESS_FALLBACKS = new Set(['""', 'null']);
const READ = 'getProperty(';

function escaped(text) {
  return text.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);
}

function testsEmptiness(condition, subject) {
  const name = String.raw`(?<![\w.$])${escaped(subject)}(?![\w$])`;
  const forms = [
    String.raw`${name}\s*\??\.\s*\w`,
    String.raw`(?:hasText|hasLength)\(\s*${name}\s*\)`,
    String.raw`${name}\s*[!=]=\s*""`,
    String.raw`""\s*[!=]=\s*${name}`,
  ];
  return new RegExp(forms.join('|'), 'u').test(condition ?? '');
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

function ownMembers(found) {
  return membersOfClass(found).filter(
    ({ owner }) => owner === undefined || owner === found.declared.qualified,
  );
}

function ownMember(view, scope, name) {
  const declared = view.classAt(scope);
  if (
    declared === undefined ||
    declared.kind === 'companion' ||
    view.declaresLocally(scope, name)
  ) {
    return undefined;
  }
  const entry = ownMembers({ file: view.file, declared }).find((member) => member.name === name);
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
    found === undefined ? undefined : ownMembers(found).find((member) => member.name === name);
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

function isResolver(view, scope, receiver) {
  return (
    !view.chain(scope).some(({ k, qualified }) => k === 'class' && stereotype(view, qualified)) &&
    view.is(view.typeOf(scope, receiver), PROPERTY_RESOLVERS)
  );
}

function readReceiver(subject) {
  const call = subject.lastIndexOf(READ);
  const key = subject.slice(call + READ.length, -1);
  if (call < 0 || !subject.endsWith(')') || /[()]/u.test(key)) {
    return undefined;
  }
  const head = subject.slice(0, call).trimEnd();
  const receiver = head.endsWith('.') ? head.slice(0, -1).replace(/\?$/u, '').trimEnd() : '';
  return receiver === '' ? undefined : receiver;
}

function resolverRead(view, scope, subject) {
  const receiver = readReceiver(subject);
  return receiver !== undefined && isResolver(view, scope, receiver);
}

function nullTestFindings(view) {
  return (view.file.nullTests ?? [])
    .filter(({ operator, fallback }) => operator !== '?:' || !HARMLESS_FALLBACKS.has(fallback))
    .filter(({ condition, subject }) => !testsEmptiness(condition, subject))
    .flatMap(({ line, scope, subject }) => {
      const name = resolverRead(view, scope, subject) ? 'getProperty' : subject;
      return name === subject && configString(view, scope, subject) === undefined
        ? []
        : [{ rule: RULE, line, symbol: symbolOf(view, scope, name) }];
    });
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

function containsFindings(view) {
  return view.file.invocations
    .filter(
      ({ name, receiver, scope }) =>
        name === 'containsProperty' && receiver !== undefined && isResolver(view, scope, receiver),
    )
    .map(({ line, scope, name }) => ({ rule: RULE, line, symbol: symbolOf(view, scope, name) }));
}

export function nullOnlyConfigChecks(view) {
  return [...nullTestFindings(view), ...guardFindings(view), ...containsFindings(view)];
}
