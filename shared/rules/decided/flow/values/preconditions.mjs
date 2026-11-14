import { fact } from '../../facts.mjs';
import { isSimpleSubject } from '../arms/arms.mjs';
import { binaryOf, sourceOf } from '../exits.mjs';

const NULL = { kind: 'literal', literal: 'null', value: 'null', children: [] };
const CONDITION = 'condition';
const NOT_NULL = 'notNull';
const JAVA_LIBRARIES = new Map([
  ['java.util.Objects', new Map([['requireNonNull', NOT_NULL]])],
  [
    'com.google.common.base.Preconditions',
    new Map([
      ['checkArgument', CONDITION],
      ['checkState', CONDITION],
      ['checkNotNull', NOT_NULL],
    ]),
  ],
  [
    'org.springframework.util.Assert',
    new Map([
      ['isTrue', CONDITION],
      ['state', CONDITION],
      ['notNull', NOT_NULL],
    ]),
  ],
  [
    'org.apache.commons.lang3.Validate',
    new Map([
      ['isTrue', CONDITION],
      ['notNull', NOT_NULL],
    ]),
  ],
  [
    'org.apache.commons.lang.Validate',
    new Map([
      ['isTrue', CONDITION],
      ['notNull', NOT_NULL],
    ]),
  ],
]);
const KOTLIN_CALLS = new Map([
  ['#require()', { kind: CONDITION }],
  ['#check()', { kind: CONDITION }],
  ['#requireNotNull()', { kind: NOT_NULL }],
  ['#checkNotNull()', { kind: NOT_NULL }],
  ['#assert()', { kind: CONDITION, assertion: true }],
]);
function importedGuarantee(callee, argument) {
  const split = callee.value.lastIndexOf('.');
  const kind =
    split < 0
      ? undefined
      : JAVA_LIBRARIES.get(callee.value.slice(0, split))?.get(callee.value.slice(split + 1));
  return kind === undefined ? undefined : { kind, argument };
}

function isStdlibCall(callee, scope) {
  return scope.kotlin && !scope.shadowed.has(callee.text ?? callee.value);
}

function guaranteeOf(call, scope) {
  const [callee, first] = call.children;
  if (callee.kind === 'name') {
    return (
      importedGuarantee(callee, first) ??
      (isStdlibCall(callee, scope)
        ? { ...KOTLIN_CALLS.get(callee.value), argument: first }
        : undefined)
    );
  }
  const owner = callee.kind === 'member' ? callee.children[0] : undefined;
  const method =
    owner?.kind === 'name' ? JAVA_LIBRARIES.get(owner.value)?.get(callee.value) : undefined;
  return method === undefined ? undefined : { kind: method, argument: first };
}

function assertOf(node) {
  return { kind: CONDITION, argument: node.children[0], assertion: true, line: node.start };
}

function stated({ kind, argument }) {
  if (argument === undefined) {
    return undefined;
  }
  if (kind === NOT_NULL) {
    return isSimpleSubject(argument)
      ? { node: binaryOf('!=', argument, NULL), holds: true }
      : undefined;
  }
  return kind === CONDITION ? { node: argument, holds: true } : undefined;
}

/**
 * What a precondition call or an assertion statement guarantees after it: the condition holds, or
 * the value is not null, because the call throws otherwise. A library is matched by the name its
 * import resolves to, never by the bare name; `assertion` facts may be switched off at run time.
 */
export function preconditionFacts(node, flow) {
  let guarantee;
  if (node.kind === 'statement' && node.value === 'assert') {
    guarantee = assertOf(node);
  } else if (node.kind === 'evaluate' && node.children[0]?.kind === 'call') {
    guarantee = guaranteeOf(node.children[0], flow.scope);
  }
  const found =
    guarantee === undefined || guarantee.kind === undefined ? undefined : stated(guarantee);
  if (found === undefined) {
    return [];
  }
  const line = String(node.start);
  const reason = guarantee.assertion
    ? `the assert on line ${line} already states this`
    : `line ${line} throws unless \`${sourceOf(found.node)}\``;
  const known = fact(found.node, flow.scope, { holds: found.holds, reason });
  return known === undefined ? [] : [{ ...known, assertion: guarantee.assertion === true }];
}
