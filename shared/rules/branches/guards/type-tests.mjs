import { nodesOf } from '../../../near-duplicates/tree/nodes.mjs';

const PATTERN = /^\w*pattern\w*:/u;

/** Whether a condition of the arm (`condition` or `conditions`) tests a type or matches a pattern. */
export function testsType(arm) {
  const tests = [
    ...(arm.conditions ?? []),
    ...(arm.condition === undefined ? [] : [arm.condition]),
  ];
  return tests
    .flatMap((test) => nodesOf(test))
    .some(({ kind, value }) => kind === 'type' || PATTERN.test(String(value)));
}
