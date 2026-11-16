import { ORDERINGS } from './declared-projects.mts';

export function orderingCases(expected: readonly (readonly string[])[]): [string[], string[]][] {
  return ORDERINGS.map((precedence, index) => [precedence, [...(expected[index] ?? [])]]);
}
