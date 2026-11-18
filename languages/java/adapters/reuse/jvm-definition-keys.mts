import { hash } from '../../../../shared/rules/finding-helpers.mjs';
import { compareText } from '../../../../shared/paths/path-order.mjs';
import { namesOf, type BoundEntry, type Definition, type Scope } from './jvm-reuse-types.mts';
import { isCallSeparator } from './jvm-references.mts';

type KeyContext = {
  readonly scope: Scope;
  readonly bindings: BoundEntry['bindings'];
  readonly definition: Definition;
};

const hashOf: (text: string) => string = hash;

const CONSTANT_NAME = /^\p{Lu}[\p{Lu}\p{N}_]+$/u;

function startsUppercase(name: string): boolean {
  return /^\p{Lu}/u.test(name);
}

function localReference(
  local: string,
  { scope, definition }: Pick<KeyContext, 'scope' | 'definition'>,
): string | undefined {
  const other = (scope.byName.get(local) ?? []).find((candidate) => candidate !== definition);
  if (other?.kind === 'const' && other.literal === true) {
    return `${local}=literal:${other.text}`;
  }
  const declared =
    other !== undefined || scope.declaredTypes.has(local) || scope.memberNames.has(local);
  return declared ? `${local}=${scope.file}` : externalReference(local, scope);
}

function externalReference(local: string, scope: Scope): string | undefined {
  const external = scope.external.get(local);
  if (external !== undefined) {
    return `${local}=${external}`;
  }
  return scope.stars !== undefined && startsUppercase(local)
    ? `${local}=${scope.stars}`
    : undefined;
}

function referenceOf(local: string, context: KeyContext): string | undefined {
  const targets = context.bindings.get(local);
  if (targets !== undefined) {
    return `${local}=${targets.map((target) => `${target.file}#${target.name}`).join('|')}`;
  }
  return local === context.definition.name ? undefined : localReference(local, context);
}

export function definitionKey(
  definition: Definition,
  { parsed, bindings, scope }: BoundEntry,
): string {
  const { start, end } = definition;
  const context = { scope, bindings, definition };
  const references = parsed.tokens
    .slice(start, end)
    .filter((_, offset) => !isCallSeparator(parsed.tokens[start + offset - 1]?.text))
    .flatMap((token) =>
      namesOf(token).map((local): [string, string | undefined] => [
        local,
        referenceOf(local, context),
      ]),
    );
  const inherits = references.some(
    ([local, reference]) => reference === undefined && CONSTANT_NAME.test(local),
  );
  const supertypes = inherits ? (definition.supertypes ?? '') : '';
  const resolved = references
    .map(([, reference]) => reference)
    .filter((reference) => reference !== undefined);
  return hashOf(
    `${definition.text}|${supertypes}|${[...new Set(resolved)].sort(compareText).join(',')}`,
  );
}
