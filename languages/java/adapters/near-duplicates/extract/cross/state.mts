import {
  instanceStateOf,
  isInside,
  namesOf,
  parametersProblem,
  throwsOf,
} from '../class-shape.mts';
import type { Node } from 'web-tree-sitter';
import type { NameSets } from '../../extract-types.mts';
import {
  CLASS,
  METHOD,
  descendants,
  field,
  pairOf,
  parentOf,
  required,
  roleOf,
} from '../syntax.mts';

const OWN_STATE = 'a copy uses members or state of its class that the shared class cannot reach';

function isLock(node: Node): boolean {
  const parent = parentOf(node);
  return (
    parent.type === 'parenthesized_expression' && parentOf(parent).type === 'synchronized_statement'
  );
}

export function lockNodes(method: Node): Node[] {
  return descendants(required(method, 'body')).filter(({ type }) => type === 'this');
}

export function lockProblem(method: Node): string | undefined {
  const keywords = descendants(method).filter(({ type }) => type === 'this' || type === 'super');
  return keywords.every((node) => node.type === 'this' && isLock(node))
    ? undefined
    : 'a copy uses this or super other than as the lock of a synchronized block';
}

function ownMember(node: Node, names: NameSets): boolean {
  if (node.type === 'identifier' && roleOf(node) === 'reference' && !names.locals.has(node.text)) {
    return names.staticFields.has(node.text) || names.instanceFields.has(node.text);
  }
  return node.type === 'method_invocation' && field(node, 'object') === undefined;
}

export function stateProblem(method: Node, holeNodes: readonly Node[]): string | undefined {
  const names = namesOf(method);
  const spans = [...holeNodes];
  const used = descendants(required(method, 'body')).filter((node) => !isInside(node, spans));
  const own = used.some((node) => ownMember(node, names));
  return own || instanceStateOf(method, spans) !== 'none' ? OWN_STATE : undefined;
}

export function topLevelProblem(methods: readonly Node[]): string | undefined {
  const [a, b] = pairOf(methods);
  const owners = methods.map((method) => parentOf(parentOf(method)));
  const checks: (readonly [boolean, string | undefined])[] = [
    [methods.some((method) => method.type !== METHOD), 'a copy is not a method'],
    [
      owners.some((owner) => owner.type !== CLASS || parentOf(owner).type !== 'program'),
      'a copy is not in a top-level class',
    ],
    [
      [...methods, ...owners].some((node) => field(node, 'type_parameters') !== undefined),
      'a method or its class has type parameters',
    ],
    [throwsOf(a) !== throwsOf(b), 'the copies declare different exceptions'],
  ];
  return checks.find(([failed]) => failed)?.[1] ?? parametersProblem(methods);
}
