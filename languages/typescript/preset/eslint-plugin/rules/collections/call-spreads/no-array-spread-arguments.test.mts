import { typedIoProject } from '../../../test-support/projects/typed-io-project.mts';
import { cases, typescriptRuleTester } from '../../../test-support/rule-tester.mts';
import { rule } from './no-array-spread-arguments.mts';

const ruleTester = typescriptRuleTester();

ruleTester.run('no-array-spread-arguments', rule, {
  valid: cases([
    'Math.max(...[left, right]);',
    'positions.push(...(next ? [index + 2] : []));',
    'const all = [...left, ...right];',
    'function forward(...args) { return target(...args); }',
    'const wrap = (...values) => new Wrapper(...values);',
    'function legacy() { return target(...arguments); }',
    'const merged = { ...defaults, ...options };',
    'target.push(item);',
    'path.join(root, ...segments);',
    'format(...values);',
    'aliases.set(...pair);',
    'Object.assign({}, ...parts);',
    "letters.push(...'abc');",
    'class Queue extends Array { add(items) { super.push(...items); } }',
    'const Math = { max: (...values) => values }; Math.max(...values);',
  ]),
  invalid: [
    'target.push(...items);',
    'Math.max(...values.map((value) => value.size));',
    'queue.unshift(...items);',
    'positions.push(...(next ? items : []));',
    'queue.splice(index, 0, ...items);',
    'String.fromCharCode(...bytes);',
    'String.fromCodePoint(...points);',
    'target?.push(...items);',
    'this.#items.push(...items);',
    'function append(target, ...rest) { const items = rest[0]; target.push(...items); }',
  ].map((code) => ({ code, errors: [{ messageId: 'spread' }] })),
});

const { tester, typed } = typedIoProject('array-spread-arguments', 'export const none = 0;');

tester.run('no-array-spread-arguments with types', rule, {
  valid: [
    [
      'export function pair(point: [number, number], seen: Set<number>, sizes: number[]) {',
      '  const stream = { push: (...values: number[]) => values.length };',
      '  stream.push(...sizes);',
      '  console.log(...sizes);',
      "  stream.push(...'text');",
      '  return Math.max(...point);',
      '}',
    ].join('\n'),
  ].map((code) => typed(code)),
  invalid: [
    {
      ...typed(
        [
          'export function all(target: number[], items: readonly number[], seen: Set<number>) {',
          '  target.push(...items);',
          '  target!.unshift(...seen);',
          '  return Math.max(...target);',
          '}',
          'export function bytes<T extends number[]>(buffer: Uint8Array, sizes: T, loose: any) {',
          '  return String.fromCharCode(...buffer) + Math.max(...sizes) + Math.min(...loose);',
          '}',
        ].join('\n'),
      ),
      errors: [
        { messageId: 'spread', line: 2 },
        { messageId: 'spread', line: 3 },
        { messageId: 'spread', line: 4 },
        { messageId: 'spread', line: 7 },
        { messageId: 'spread', line: 7 },
        { messageId: 'spread', line: 7 },
      ],
    },
  ],
});
