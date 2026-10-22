import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { normalizeEslintResults } from '../eslint/normalize.mjs';

const temporaryRoots = [];

afterAll(() => {
  for (const root of temporaryRoots) {
    rmSync(root, { recursive: true, force: true });
  }
});

function positionOf(code, offset) {
  const before = code.slice(0, offset).split('\n');
  return { line: before.length, column: (before.at(-1)?.length ?? 0) + 1 };
}

function messageFor(kind, code, reported) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-immutable-hint-'));
  temporaryRoots.push(root);
  mkdirSync(path.join(root, 'src'), { recursive: true });
  writeFileSync(path.join(root, 'src/x.ts'), code);
  const start = code.indexOf(reported);
  const first = positionOf(code, start);
  const last = positionOf(code, start + reported.length);
  const [finding] = normalizeEslintResults({
    value: [
      {
        filePath: path.join(root, 'src/x.ts'),
        messages: [
          {
            ruleId: 'functional/prefer-immutable-types',
            message: `${kind} should have an immutability of at least "ReadonlyDeep" (actual: "Mutable").`,
            severity: 2,
            line: first.line,
            column: first.column,
            endLine: last.line,
            endColumn: last.column,
          },
        ],
      },
    ],
    projectRoot: root,
    analyzerName: 'eslint-lint',
  });
  return finding.message;
}

const TAIL = 'domain/ values must be deeply readonly.';
const GENERIC = 'Type it deeply readonly, e.g. `readonly T[]` or `{ readonly field: T }`.';
const SET_HINT = 'Type it `ReadonlySet<T>`, or build it inline: `[...new Set(xs)]`.';
const DATE_HINT = 'Type it `Readonly<Date>`, or keep it unbound like `new Date(ms).getUTCHours()`.';
const MAP_HINT = 'Type it `ReadonlyMap<K, readonly V[]>`.';
const ARRAY_HINT = 'Type it `readonly T[]`.';

describe('prefer-immutable-types message for a variable', () => {
  it.each([
    [
      'an array built by filter',
      'const evens = xs.filter((x) => x % 2 === 0);\n',
      'evens',
      `Variable \`evens\` is mutable (array); ${TAIL} ${ARRAY_HINT}`,
    ],
    [
      'an array literal',
      'const ids = [1, 2, 3];\n',
      'ids',
      `Variable \`ids\` is mutable (array); ${TAIL} ${ARRAY_HINT}`,
    ],
    [
      'a Set',
      'const seen = new Set(xs);\n',
      'seen',
      `Variable \`seen\` is mutable (Set); ${TAIL} ${SET_HINT}`,
    ],
    [
      'a Map',
      'const byId = new Map(entries);\n',
      'byId',
      `Variable \`byId\` is mutable (Map); ${TAIL} ${MAP_HINT}`,
    ],
    [
      'Map.groupBy',
      'const groups = Map.groupBy(items, (item) => item.kind);\n',
      'groups',
      `Variable \`groups\` is mutable (Map); ${TAIL} ${MAP_HINT}`,
    ],
    [
      'a regular expression exec result',
      'const match = /(\\d+)/u.exec(text);\n',
      'match',
      `Variable \`match\` is mutable (RegExpExecArray); ${TAIL} Destructure the match in the same statement, or use \`.test\`.`,
    ],
    [
      'a Date',
      'const now = new Date(ms);\n',
      'now',
      `Variable \`now\` is mutable (Date); ${TAIL} ${DATE_HINT}`,
    ],
    [
      'a zod schema',
      'const schema = z.object({ id: z.string() });\n',
      'schema',
      `Variable \`schema\` is mutable (zod schema); ${TAIL} Zod schemas are always mutable: keep them in adapters/, or inline the call where it is used.`,
    ],
    [
      'a regular expression literal',
      'const pattern = /ab+c/u;\n',
      'pattern',
      `Variable \`pattern\` is mutable (RegExp); ${TAIL} RegExp objects are always mutable: keep them in adapters/, or write the literal inline where it is used.`,
    ],
    [
      'a type annotation naming a Set',
      'const seen: Set<string> = build();\n',
      'seen: Set<string>',
      `Variable \`seen\` is mutable (Set); ${TAIL} ${SET_HINT}`,
    ],
    [
      'a value whose type cannot be told',
      'const total = compute(items);\n',
      'total',
      `Variable \`total\` is mutable; ${TAIL} ${GENERIC}`,
    ],
  ])('names the variable and the matching form for %s', (_, code, reported, expected) => {
    expect(messageFor('Variable', code, reported)).toBe(expected);
  });

  it('names a destructured variable without guessing its type', () => {
    expect(messageFor('Variable', 'const { rows } = load();\n', 'rows')).toBe(
      `Variable \`rows\` is mutable; ${TAIL} ${GENERIC}`,
    );
  });
});

describe('prefer-immutable-types message for a parameter', () => {
  it('names the Date parameter and its form', () => {
    expect(messageFor('Parameter', 'function f(when: Date): void {}\n', 'when: Date')).toBe(
      `Parameter \`when\` is mutable (Date); ${TAIL} ${DATE_HINT}`,
    );
  });

  it('names the mutable member of an options type', () => {
    const code =
      'type Options = { readonly id: string; readonly signal: AbortSignal };\nfunction upload(options: Options): void {}\n';

    expect(messageFor('Parameter', code, 'options: Options')).toBe(
      `Parameter \`options\` is mutable (\`signal: AbortSignal\`); ${TAIL} AbortSignal is a class and always mutable: keep it in adapters/ and pass domain code a plain value.`,
    );
  });

  it('names the member that is not readonly', () => {
    const code =
      'interface Options {\n  readonly id: string;\n  retries: number;\n}\nfunction upload(options: Options): void {}\n';

    expect(messageFor('Parameter', code, 'options: Options')).toBe(
      `Parameter \`options\` is mutable (\`retries\` is not readonly); ${TAIL} ${GENERIC}`,
    );
  });

  it('names the mutable member of an inline object type', () => {
    const code = 'function upload(options: { readonly items: Item[] }): void {}\n';

    expect(messageFor('Parameter', code, 'options: { readonly items: Item[] }')).toBe(
      `Parameter \`options\` is mutable (\`items: Item[]\`); ${TAIL} ${ARRAY_HINT}`,
    );
  });

  it('looks through readonly wrappers and finds the mutable element', () => {
    const code = 'function f(rows: readonly (readonly Date[])[]): void {}\n';

    expect(messageFor('Parameter', code, 'rows: readonly (readonly Date[])[]')).toBe(
      `Parameter \`rows\` is mutable (Date); ${TAIL} ${DATE_HINT}`,
    );
  });

  it('falls back to the generic message when the type is declared elsewhere', () => {
    expect(messageFor('Parameter', 'function f(order: Order): void {}\n', 'order: Order')).toBe(
      `Parameter \`order\` is mutable; ${TAIL} ${GENERIC}`,
    );
  });

  it('names a parameter whose default value shows the type', () => {
    expect(
      messageFor('Parameter', 'function f(seen = new Set()): void {}\n', 'seen = new Set()'),
    ).toBe(`Parameter \`seen\` is mutable (Set); ${TAIL} ${SET_HINT}`);
  });
});

describe('prefer-immutable-types message for a return type and a property', () => {
  it('names the function and the array it returns', () => {
    const code = 'function listItems(): Item[] {\n  return [];\n}\n';

    expect(messageFor('Return type', code, ': Item[]')).toBe(
      `Return type of \`listItems\` is mutable (array); ${TAIL} ${ARRAY_HINT}`,
    );
  });

  it('names an arrow function bound to a constant', () => {
    const code = 'const listItems = () => [1];\n';

    expect(messageFor('Return type', code, '() => [1]')).toBe(
      `Return type of \`listItems\` is mutable (array); ${TAIL} ${ARRAY_HINT}`,
    );
  });

  it('names the property', () => {
    const code = 'class Box {\n  readonly tags: string[] = [];\n}\n';

    expect(messageFor('Property', code, 'readonly tags: string[] = []')).toBe(
      `Property \`tags\` is mutable (array); ${TAIL} ${ARRAY_HINT}`,
    );
  });
});

describe('prefer-immutable-types message for forms that need an annotation', () => {
  const CALLBACK_HINT =
    "Annotate the callback's return type with readonly fields: `(item): Summary => ({ ... })`, or `(line): readonly string[] => ...`.";

  it.each([
    [
      'an object-returning callback',
      'const rows = items.map((item) => ({ id: item.id }));\n',
      '(item) => ({ id: item.id })',
    ],
    [
      'an array-returning callback',
      'const rows = lines.map((line) => line.split(","));\n',
      '(line) => line.split(",")',
    ],
  ])('tells %s to annotate its return type', (_, code, reported) => {
    expect(messageFor('Return type', code, reported)).toBe(
      `Return type is mutable (callback); ${TAIL} ${CALLBACK_HINT}`,
    );
  });

  it('tells a destructured rest element to take an annotated slice', () => {
    expect(messageFor('Variable', 'const [head, ...rest] = text.split(" ");\n', '...rest')).toBe(
      `Variable \`rest\` is mutable (rest element); ${TAIL} A rest element is always mutable: take the tail into an annotated const, \`const rest: readonly T[] = xs.slice(1)\`.`,
    );
  });

  it('names the Object.groupBy result type', () => {
    const code =
      'function byTag(items: readonly Item[]) {\n  return Object.groupBy(items, (i) => i.tag);\n}\n';

    expect(messageFor('Return type', code, 'function byTag')).toBe(
      `Return type of \`byTag\` is mutable (Object.groupBy result); ${TAIL} Type it \`Readonly<Partial<Record<Key, readonly T[]>>>\`.`,
    );
  });

  it('tells an object literal variable to carry a readonly type', () => {
    expect(messageFor('Variable', 'const totals = { paid: 0 };\n', 'totals')).toBe(
      `Variable \`totals\` is mutable (object literal); ${TAIL} Give it a type with readonly fields: \`const x: { readonly a: number } = ...\`, or return it from a function with a readonly return type.`,
    );
  });

  it('tells an Error field to use unknown', () => {
    const code =
      "type Failure = { readonly kind: 'failed'; readonly error: Error };\nfunction f(failure: Failure): void {}\n";

    expect(messageFor('Parameter', code, 'failure: Failure')).toBe(
      `Parameter \`failure\` is mutable (\`error: Error\`); ${TAIL} Error is a class and always mutable: type the field \`unknown\` (domain/ allows \`error\` and \`cause\` typed unknown for a caught error) or carry \`message: string\`.`,
    );
  });

  it('tells a generic parameter to constrain with readonly fields', () => {
    const code = 'function f<T extends { id: string }>(item: T): void {}\n';

    expect(messageFor('Parameter', code, 'item: T')).toBe(
      `Parameter \`item\` is mutable (generic type); ${TAIL} Constrain the type parameter with readonly fields: \`<T extends { readonly id: string }>\`.`,
    );
  });
});
