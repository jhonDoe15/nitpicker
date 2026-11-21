import { typedIoProject } from '../../test-support/projects/typed-io-project.mts';
import { rule } from './no-union-order-dependence.mts';

const TYPESCRIPT = [
  'export interface Symbol { name: string }',
  'export interface Type { flags: number; isUnion(): this is UnionType; getProperties(): Symbol[] }',
  'export interface UnionOrIntersectionType extends Type { types: Type[] }',
  'export interface UnionType extends UnionOrIntersectionType { origin?: Type }',
  'export interface IntersectionType extends UnionOrIntersectionType { resolved?: Type }',
  'export interface TypeChecker { typeToString(type: Type): string; isArrayType(type: Type): boolean }',
  'export declare const TypeFlags: { Null: number; Undefined: number; Object: number; StringLiteral: number };',
  'declare const ts: { TypeFlags: typeof TypeFlags };',
  'export default ts;',
].join('\n');

const { tester, typed } = typedIoProject(
  'union-order',
  'export const none = 0;',
  {},
  {
    typescript: TYPESCRIPT,
  },
);

const HEADER = [
  "import ts, { TypeFlags, type IntersectionType, type Type, type TypeChecker, type UnionType } from 'typescript';",
  'declare const checker: TypeChecker;',
  'declare const type: Type;',
  'declare const union: UnionType;',
  'declare const both: IntersectionType;',
  'declare const config: { types: string[] };',
  'declare function use(value: unknown): void;',
].join('\n');

function source(body: string): string {
  return `${HEADER}\nexport function run(): void {\n${body}\n}\n`;
}

tester.run('no-union-order-dependence', rule, {
  valid: [
    'use(config.types[0]); use(config.types.find((entry) => entry.length > 0));',
    'use(union.types.some((member) => checker.isArrayType(member)));',
    'use(union.types.filter((member) => checker.isArrayType(member)));',
    'if (union.types.find((member) => checker.isArrayType(member)) !== undefined) use(union);',
    'if (union.types[0]) use(union);',
    'use(union.types.find((member) => (member.flags & ts.TypeFlags.Null) !== 0));',
    'use(union.types.find((member) => member.flags & TypeFlags.Undefined));',
    'if (union.types.length !== 1) return; use(union.types[0]);',
    'if (union.types.length === 1) use(union.types[0]);',
    'use(new Map(union.types.map((member) => [member.flags, member])));',
    "use(checker.typeToString(type) === 'string');",
    'use(checker.typeToString(type).length);',
    'const [first] = config.types; use(first);',
    'use(union.types.find((member) => checker.isArrayType(member)) ? 1 : 2);',
    'use(Boolean(union.types.find((member) => checker.isArrayType(member))));',
    'use(union.types.find((member) => member === type));',
    'use(union.types.find(function (member) { return member.flags === TypeFlags.Null; }));',
    'use(union.types.find((member) => checker.isArrayType(member) && (member as unknown as { value: string }).value === "a"));',
    'use(checker.typeToString(type) === checker.typeToString(union));',
  ].map((body) => typed(source(body))),
  invalid: [
    ['use(union.types[0]);', '`.types[0]`'],
    ['use(both.types.at(-1));', '`.types.at(...)`'],
    ['use(union.types.find((member) => checker.isArrayType(member)));', '`.types.find(...)`'],
    [
      'use(union.types.findLast((member) => (member.flags & TypeFlags.Object) !== 0));',
      '`.types.findLast(...)`',
    ],
    [
      'use(union.types.find((member) => !(member.flags & ts.TypeFlags.Undefined)));',
      '`.types.find(...)`',
    ],
    [
      'use(union.types.find((member) => (member.flags & ts.TypeFlags.Null) === 0));',
      '`.types.find(...)`',
    ],
    ['use(union.types.find((member) => member.flags !== TypeFlags.Null));', '`.types.find(...)`'],
    ['if (both.types.length === 1) return; use(union.types[0]);', '`.types[0]`'],
    ['if (union.types.length > 1) use(union.types[0]);', '`.types[0]`'],
    ['use(union.types.filter((member) => checker.isArrayType(member))[0]);', '`.types[0]`'],
    ['if (type.isUnion()) use(type.types[0]);', '`.types[0]`'],
    ['use((type as UnionType).types.find((member) => member.flags === 1));', '`.types.find(...)`'],
    ['const [first] = union.types; use(first);', 'Destructuring the first item of `.types`'],
    [
      'use(new Map(union.types.flatMap((member) => member.getProperties().map((p) => [p.name, p]))));',
      '`new Map(...)` over `.types.flatMap(...)`',
    ],
    [
      'use(Object.fromEntries(union.types.flatMap((m) => m.getProperties().map((p) => [p.name, p]))));',
      '`Object.fromEntries(...)` over `.types.flatMap(...)`',
    ],
  ]
    .map(([body = '', form = '']) => ({
      ...typed(source(body)),
      errors: [{ messageId: 'memberPick', data: { form } }],
    }))
    .concat(
      [
        "use(checker.typeToString(type) !== 'string | undefined');",
        `use(\`A | \${String(1)}\` === checker.typeToString(type));`,
      ].map((body) => ({
        ...typed(source(body)),
        errors: [{ messageId: 'typeText', data: { form: '' } }],
      })),
    ),
});
