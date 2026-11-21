import { nodesOf } from '../../../near-duplicates/tree/nodes.mts';
import type { Arm } from '../arm-types.mts';

const PATTERN = /^\w*pattern\w*:/u;

export function testsType(arm: Pick<Arm, 'condition' | 'conditions'>): boolean {
  const tests = [
    ...(arm.conditions ?? []),
    ...(arm.condition === undefined ? [] : [arm.condition]),
  ];
  return tests
    .flatMap((test) => nodesOf(test))
    .some(({ kind, value }) => kind === 'type' || PATTERN.test(String(value)));
}
