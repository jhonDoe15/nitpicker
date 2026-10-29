import { hash } from '../../../../shared/rules/finding-helpers.mjs';
import { namesOf } from './source/jvm-tokens.mjs';
import { CALL_SEPARATORS } from './jvm-references.mjs';

const CONSTANT_NAME = /^\p{Lu}[\p{Lu}\p{N}_]+$/u;

function startsUppercase(name) {
  return /^\p{Lu}/u.test(name);
}

function localReference(local, { scope, definition }) {
  const other = (scope.byName.get(local) ?? []).find((candidate) => candidate !== definition);
  if (other?.kind === 'const' && other.literal === true) {
    return `${local}=literal:${other.text}`;
  }
  const declared =
    other !== undefined || scope.declaredTypes.has(local) || scope.memberNames.has(local);
  return declared ? `${local}=${scope.file}` : externalReference(local, scope);
}

function externalReference(local, scope) {
  const external = scope.external.get(local);
  if (external !== undefined) {
    return `${local}=${external}`;
  }
  return scope.stars !== undefined && startsUppercase(local)
    ? `${local}=${scope.stars}`
    : undefined;
}

function referenceOf(local, context) {
  const targets = context.bindings.get(local);
  if (targets !== undefined) {
    return `${local}=${targets.map((target) => `${target.file}#${target.name}`).join('|')}`;
  }
  return local === context.definition.name ? undefined : localReference(local, context);
}

export function definitionKey(definition, { parsed, bindings, scope }) {
  const { start, end } = definition;
  const context = { scope, bindings, definition };
  const references = parsed.tokens
    .slice(start, end)
    .filter((_, offset) => !CALL_SEPARATORS.has(parsed.tokens[start + offset - 1]?.text))
    .flatMap((token) => namesOf(token).map((local) => [local, referenceOf(local, context)]));
  const inherits = references.some(
    ([local, reference]) => reference === undefined && CONSTANT_NAME.test(local),
  );
  const supertypes = inherits ? (definition.supertypes ?? '') : '';
  const resolved = references.map(([, reference]) => reference).filter(Boolean);
  return hash(`${definition.text}|${supertypes}|${[...new Set(resolved)].sort().join(',')}`);
}
