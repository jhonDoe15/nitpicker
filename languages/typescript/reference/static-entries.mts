import dependencyCruiser from '../preset/defaults/dependency-cruiser.config.mjs';
import { ruleEntry, wordsOfKebab, type RuleEntry } from './typed/entry-types.mts';

const GUIDE = 'docs/typescript-strict-preset.md';
const TYPESCRIPT_AND_JAVASCRIPT = ['typescript', 'javascript'];
const CRUISER_NOTES: Readonly<Record<string, readonly string[]>> = {
  'no-production-to-test': [
    'Production code imports a test file or a file under a test root.',
    'Code that ships must not depend on code that only tests use.',
    'Move what both need to a production module, or keep the import in a test.',
  ],
  'no-production-cycles': [
    'Production modules import each other in a cycle.',
    'A cycle makes modules impossible to load, test or replace one at a time.',
    'Break the cycle: move the shared part to a module both import, or pass the dependency in as a parameter.',
  ],
};
const CRUISER_WHY =
  'dependency-cruiser checks the import graph of the production code against the architecture rules of the strict preset.';
const NO_EXCEPTION_OUTSIDE_ROOTS =
  'It has no exception: move the code under a source root, or add its folder to `layout.sourceRoots`.';

function cruiserEntry({
  name,
  comment,
}: {
  readonly name: string;
  readonly comment: string;
}): RuleEntry {
  const [summary, why, allowed] = CRUISER_NOTES[name] ?? [wordsOfKebab(name), CRUISER_WHY, comment];
  const outsideRoots = name === 'no-import-outside-roots';
  return ruleEntry({
    tool: 'dependency-architecture',
    rule: name,
    page: 'typescript-static',
    analyzers: Object.fromEntries(
      TYPESCRIPT_AND_JAVASCRIPT.map((preset) => [preset, ['dependency-architecture']]),
    ),
    summary,
    why,
    allowed,
    docs: [{ label: 'Strict preset guide', path: GUIDE, anchor: 'layout-and-boundaries' }],
    exception: outsideRoots
      ? { note: NO_EXCEPTION_OUTSIDE_ROOTS }
      : { key: 'exceptions', rule: name },
  });
}

const TYPECHECK_TOOL = 'typescript-typecheck';
const COMPILER_ERROR_NOTE =
  'A compiler error has no exception: fix the type error. A config entry for one is rejected.';

const IMPLICIT_ANY_CODES: readonly (readonly [string, string])[] = [
  ['TS7005', 'A variable whose type is implicitly `any`.'],
  ['TS7006', 'A parameter whose type is implicitly `any`.'],
  ['TS7031', 'A destructured binding whose type is implicitly `any`.'],
  ['TS7034', 'A variable whose type is implicitly `any` in some places.'],
  ['TS7053', 'An element access that is implicitly `any`, since the key cannot index the type.'],
];

function implicitAnyRow([rule, summary]: readonly [string, string]): Readonly<
  Record<string, unknown>
> & { readonly tool: string; readonly rule: string } {
  return {
    tool: TYPECHECK_TOOL,
    rule,
    summary,
    why: 'The preset turns on `noImplicitAny`, so every value has a type the checker can follow.',
    allowed: 'Give the value a type at its source, or narrow an `unknown` value before using it.',
    exception: { note: COMPILER_ERROR_NOTE },
  };
}

const OTHER_ROWS = [
  {
    tool: 'prettier-format',
    rule: 'prettier/prettier',
    summary: 'Lines that Prettier would format differently.',
    why: 'One layout for every file, so that reviews are about the code and not its formatting.',
    allowed:
      "Run `nitpicker --fix`: it formats the changed files that were formatted on the base, with the gate's Prettier config.",
    exception: { key: 'exceptions', rule: 'prettier/prettier' },
  },
  {
    tool: TYPECHECK_TOOL,
    rule: 'TS4111',
    summary: 'A property of a type with an index signature read with dot access (`env.NODE_ENV`).',
    why: 'The preset turns on `noPropertyAccessFromIndexSignature`, so a read that may be undefined looks different from a declared property.',
    allowed: "Read it with brackets (`env['NODE_ENV']`), or declare the property on the type.",
    exception: { note: COMPILER_ERROR_NOTE },
  },
  {
    tool: TYPECHECK_TOOL,
    rule: 'TS<code>',
    pattern: '^TS\\d+$',
    barePattern: true,
    summary: 'A TypeScript compiler error, with the compiler code (`TS2322`).',
    why: 'The project type-checks under the strictest compiler options of the preset.',
    allowed: 'Fix the type error.',
    exception: { note: COMPILER_ERROR_NOTE },
  },
];

function otherEntry({
  tool,
  rule,
  ...fields
}: {
  readonly tool: string;
  readonly rule: string;
} & Readonly<Record<string, unknown>>): RuleEntry {
  return ruleEntry({
    tool,
    rule,
    page: 'typescript-static',
    analyzers: Object.fromEntries(TYPESCRIPT_AND_JAVASCRIPT.map((preset) => [preset, [tool]])),
    ...fields,
  });
}

export function staticEntries(): RuleEntry[] {
  return [
    ...dependencyCruiser.forbidden.map(cruiserEntry),
    ...[...OTHER_ROWS, ...IMPLICIT_ANY_CODES.map(implicitAnyRow)].map(otherEntry),
  ];
}
