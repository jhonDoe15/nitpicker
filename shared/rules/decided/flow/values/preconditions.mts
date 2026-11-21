import { fact } from '../../facts.mts';
import { isSimpleSubject } from '../arms/arms.mts';
import { binaryOf, sourceOf } from '../exits.mts';
import { present } from '../../../../near-duplicates/tree/nodes.mts';
import type { Fact, Flow, FlowNode, FlowScope } from '../../typed/decided-types.mts';

type Guarantee = {
  readonly kind?: string;
  readonly argument: FlowNode | undefined;
  readonly assertion?: true;
  readonly line?: number | undefined;
};

const NOT_NULL_KIND = 'notNull';
const IS_TRUE = 'isTrue';

const NULL: FlowNode = { kind: 'literal', literal: 'null', value: 'null', children: [] };
const CONDITION = 'condition';
const NOT_NULL = NOT_NULL_KIND;
const JAVA_LIBRARIES = new Map<string, Map<string, string>>([
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
      [IS_TRUE, CONDITION],
      ['state', CONDITION],
      [NOT_NULL_KIND, NOT_NULL],
    ]),
  ],
  [
    'org.apache.commons.lang3.Validate',
    new Map([
      [IS_TRUE, CONDITION],
      [NOT_NULL_KIND, NOT_NULL],
    ]),
  ],
  [
    'org.apache.commons.lang.Validate',
    new Map([
      [IS_TRUE, CONDITION],
      [NOT_NULL_KIND, NOT_NULL],
    ]),
  ],
]);
const KOTLIN_CALLS = new Map<string, { kind: string; assertion?: true }>([
  ['#require()', { kind: CONDITION }],
  ['#check()', { kind: CONDITION }],
  ['#requireNotNull()', { kind: NOT_NULL }],
  ['#checkNotNull()', { kind: NOT_NULL }],
  ['#assert()', { kind: CONDITION, assertion: true as const }],
]);
function importedGuarantee(
  callee: FlowNode,
  argument: FlowNode | undefined,
): Guarantee | undefined {
  const name = present(callee.value);
  const split = name.lastIndexOf('.');
  const kind =
    split < 0 ? undefined : JAVA_LIBRARIES.get(name.slice(0, split))?.get(name.slice(split + 1));
  return kind === undefined ? undefined : { kind, argument };
}

function isStdlibCall(callee: FlowNode, scope: FlowScope): boolean {
  return scope.kotlin && !scope.shadowed.has(callee.text ?? callee.value ?? '');
}

function guaranteeOf(call: FlowNode, scope: FlowScope): Guarantee | undefined {
  const [rawCallee, first] = call.children;
  const callee = present(rawCallee);
  if (callee.kind === 'name') {
    return (
      importedGuarantee(callee, first) ??
      (isStdlibCall(callee, scope)
        ? { ...KOTLIN_CALLS.get(callee.value ?? ''), argument: first }
        : undefined)
    );
  }
  const owner = callee.kind === 'member' ? callee.children[0] : undefined;
  const method =
    owner?.kind === 'name'
      ? JAVA_LIBRARIES.get(owner.value ?? '')?.get(callee.value ?? '')
      : undefined;
  return method === undefined ? undefined : { kind: method, argument: first };
}

function assertOf(node: FlowNode): Guarantee {
  return { kind: CONDITION, argument: node.children[0], assertion: true, line: node.start };
}

function stated({ kind, argument }: Guarantee): { node: FlowNode; holds: boolean } | undefined {
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

export function preconditionFacts(node: FlowNode, flow: Flow): Fact[] {
  let guarantee: Guarantee | undefined;
  if (node.kind === 'statement' && node.value === 'assert') {
    guarantee = assertOf(node);
  } else if (node.kind === 'evaluate' && node.children[0]?.kind === 'call') {
    guarantee = guaranteeOf(node.children[0], flow.scope);
  }
  if (guarantee?.kind === undefined) {
    return [];
  }
  const found = stated(guarantee);
  if (found === undefined) {
    return [];
  }
  const line = String(node.start);
  const reason =
    guarantee.assertion === true
      ? `the assert on line ${line} already states this, and assertions may be off at run time`
      : `line ${line} throws unless \`${sourceOf(found.node)}\``;
  const known = fact(found.node, flow.scope, { holds: found.holds, reason });
  return known === undefined
    ? []
    : [{ ...known, ...(guarantee.assertion === true ? { assertion: true as const } : {}) }];
}
