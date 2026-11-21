import { describe, expect, it } from 'vitest';
import { typescriptApi } from '../../../../adapters/typed/typescript-program.mts';
import { findNearDuplicates } from '../../../../../../shared/near-duplicates/engine.mts';
import type { TreeNode } from '../../../../../../shared/near-duplicates/tree/tree-types.mts';
import { fieldOf } from '../../../../../../shared/values/readers.mts';
import { COPIES } from '../../../../../../shared/near-duplicates/test-support/copies.mts';
import { javascriptUnits } from '../../../../../../shared/near-duplicates/test-support/javascript.mts';
import { nearDuplicateUnitNodes, nearDuplicateUnits } from './units.mts';
import { FORMAT_COPY, JSX_COPIES, TYPESCRIPT_COPIES, UNIT_FORMS } from './test-support/sources.mts';

const ts = typescriptApi();

type Unit = ReturnType<typeof nearDuplicateUnits>[number];
type NearFinding = ReturnType<typeof findNearDuplicates>[number];

function unitsOf(text: string, file: string): Unit[] {
  return nearDuplicateUnits(ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true), file);
}

function isTree(value: unknown): value is TreeNode {
  const children = fieldOf(value, 'children');
  return (
    typeof fieldOf(value, 'kind') === 'string' && Array.isArray(children) && children.every(isTree)
  );
}

function nearFindings(units: readonly Unit[]): NearFinding[] {
  return findNearDuplicates(
    units.map((unit) => {
      if (!isTree(unit.tree)) {
        throw new TypeError(`The tree of ${unit.id} holds a list in place of a node`);
      }
      return { ...unit, tree: unit.tree };
    }),
  );
}

function verdicts(findings: readonly NearFinding[]) {
  return findings.map(({ verdict, units }) => ({ verdict, units }));
}

function holes(finding: NearFinding) {
  return finding.parameters.map(({ kind, a, b }) => [kind, a.text ?? a.value, b.text ?? b.value]);
}

function withoutLines(tree: unknown): unknown {
  const stripped: unknown = JSON.parse(
    JSON.stringify(tree, (key: string, value: unknown): unknown =>
      ['start', 'end', 'text'].includes(key) ? undefined : value,
    ),
  );
  return stripped;
}

function findingFor(findings: readonly NearFinding[], name: string): NearFinding {
  const found = findings.find(({ units }) => units.some((unit) => unit.endsWith(`#${name}`)));
  if (found === undefined) {
    throw new Error(`No finding for ${name}`);
  }
  return found;
}

describe('TypeScript and JavaScript trees for near-duplicate detection', () => {
  it('gives the verdicts of the reference JavaScript trees on plain JavaScript', () => {
    const expected = verdicts(findNearDuplicates(javascriptUnits(COPIES, { file: 'copies.js' })));

    expect(verdicts(nearFindings(unitsOf(COPIES, 'copies.js')))).toEqual(expected);
  });

  it('reports a copied function with one changed literal as parameterizable', () => {
    const finding = findingFor(nearFindings(unitsOf(TYPESCRIPT_COPIES, 'copies.ts')), 'parseUrl');

    expect(finding.verdict).toBe('parameterizable');
    expect(holes(finding)).toEqual([['value', '"empty uri"', '"empty url"']]);
  });

  it('reports a copied JSX element with different props as parameterizable', () => {
    const findings = nearFindings(unitsOf(JSX_COPIES, 'copies.tsx'));
    const finding = findingFor(findings, 'AlignTopButton');

    expect(finding.verdict).toBe('parameterizable');
    expect(holes(finding).map(([kind, left]) => [kind, left])).toEqual([
      ['value', '<AlignBottomIcon />'],
      ['value', '"labels.alignBottom"'],
      ['value', '"bottom"'],
      ['value', '"CtrlOrCmd+Shift+Down"'],
    ]);
  });

  it('reports a copy with one extra statement and a run shared by two functions as partial runs', () => {
    const findings = nearFindings(unitsOf(TYPESCRIPT_COPIES, 'copies.ts'));

    expect(findingFor(findings, 'saveDraft').verdict).toBe('partial-run');
    expect(findingFor(findings, 'importUsers').verdict).toBe('partial-run');
    expect(findingFor(findings, 'importUsers').run).toHaveLength(2);
  });

  it('treats renamed locals as the same code and differently imported helpers as a hole', () => {
    const findings = nearFindings(unitsOf(TYPESCRIPT_COPIES, 'copies.ts'));
    const imported = nearFindings([
      ...unitsOf(`import { formatDate } from './dates';\n${FORMAT_COPY}`, 'a.ts'),
      ...unitsOf(`import { formatDate } from './calendar';\n${FORMAT_COPY}`, 'b.ts'),
    ]);

    expect(findingFor(findings, 'totalPrice').verdict).toBe('same');
    expect(imported[0]?.parameters.map(({ a, b }) => [a.value, b.value])).toEqual([
      ['./calendar#formatDate', './dates#formatDate'],
    ]);
  });

  it('names every function form after where it is declared, and skips declaration files', () => {
    const units = unitsOf(UNIT_FORMS, 'forms.ts');

    expect(units.map(({ id }) => id)).toEqual([
      'forms.ts#plain',
      'forms.ts#arrow',
      'forms.ts#Store.constructor',
      'forms.ts#Store.load',
      'forms.ts#Store.get size',
      'forms.ts#Store.onChange',
      'forms.ts#handlers.open',
      'forms.ts#handlers.close',
      'forms.ts#router.get("/users")',
      'forms.ts#router.get("/users")#2',
    ]);
    expect(unitsOf('export declare function plain(): void;', 'forms.d.ts')).toEqual([]);
  });

  it('keeps types, assertions and quote styles out of function bodies', () => {
    const typed = unitsOf("function f(a: string) { return (a as string)!.trim() + 'x'; }", 'a.ts');
    const plain = unitsOf('function f(a) { return a.trim() + "x"; }', 'a.js');

    expect(withoutLines(typed[0]?.tree.children[2])).toEqual(
      withoutLines(plain[0]?.tree.children[2]),
    );
  });

  it('marks the units a call always reaches, so their bodies can be inlined', () => {
    const text = [
      'function declared(a: number) { return a; }',
      'const constant = (a: number) => a;',
      'let reassignable = (a: number) => a;',
      'class Shape {',
      '  area(a: number) { return a; }',
      '  private scaled(a: number) { return a; }',
      '  #hidden(a: number) { return a; }',
      '}',
    ].join('\n');
    const marks = unitsOf(text, 'shapes.ts').map(({ name, final }) => [name, final]);

    expect(marks).toEqual([
      ['declared', true],
      ['constant', true],
      ['reassignable', false],
      ['Shape.area', false],
      ['Shape.scaled', true],
      ['Shape.#hidden', true],
    ]);
  });

  it('proves a loop and the some call that replaces it the same in TypeScript', () => {
    const text = `
export function hasOverdueLoop(loans: Loan[], today: Date): boolean {
  audit.record('overdue', loans.length, today);
  for (const loan of loans) {
    if (!loan.returned && loan.due < today) {
      return true;
    }
  }
  return false;
}
export function hasOverdueSome(loans: Loan[], today: Date): boolean {
  audit.record('overdue', loans.length, today);
  return loans.some((loan) => !loan.returned && loan.due < today);
}
`;

    expect(verdicts(nearFindings(unitsOf(text, 'loans.ts')))).toEqual([
      { verdict: 'same', units: ['loans.ts#hasOverdueLoop', 'loans.ts#hasOverdueSome'] },
    ]);
  });

  it('lists the syntax node of each unit in the order of the units', () => {
    const text =
      'export function first(a: number) {\n  return a + 1;\n}\n\nexport function second(b: number) {\n  return b * 2;\n}\n';
    const sourceFile = ts.createSourceFile('pair.ts', text, ts.ScriptTarget.Latest, true);
    const names = nearDuplicateUnitNodes(sourceFile).map((node) =>
      ts.isFunctionDeclaration(node) ? node.name?.text : undefined,
    );
    expect(names).toEqual(nearDuplicateUnits(sourceFile, 'pair.ts').map(({ name }) => name));
  });
});
