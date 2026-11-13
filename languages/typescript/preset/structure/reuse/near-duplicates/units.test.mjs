import { describe, expect, it } from 'vitest';
import { ts } from '../../../../typescript-api/typescript-api.mjs';
import { findNearDuplicates } from '../../../../../../shared/near-duplicates/engine.mjs';
import { COPIES } from '../../../../../../shared/near-duplicates/test-support/copies.mjs';
import { javascriptUnits } from '../../../../../../shared/near-duplicates/test-support/javascript.mjs';
import { nearDuplicateUnits } from './units.mjs';
import { FORMAT_COPY, JSX_COPIES, TYPESCRIPT_COPIES, UNIT_FORMS } from './test-support/sources.mjs';

function unitsOf(text, file) {
  return nearDuplicateUnits(ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true), file);
}

function verdicts(findings) {
  return findings.map(({ verdict, units }) => ({ verdict, units }));
}

function holes(finding) {
  return finding.parameters.map(({ kind, a, b }) => [kind, a.text ?? a.value, b.text ?? b.value]);
}

function withoutLines(tree) {
  return JSON.parse(
    JSON.stringify(tree, (key, value) =>
      ['start', 'end', 'text'].includes(key) ? undefined : value,
    ),
  );
}

function findingFor(findings, name) {
  return findings.find(({ units }) => units.some((unit) => unit.endsWith(`#${name}`)));
}

describe('TypeScript and JavaScript trees for near-duplicate detection', () => {
  it('gives the verdicts of the reference JavaScript trees on plain JavaScript', () => {
    const expected = verdicts(findNearDuplicates(javascriptUnits(COPIES, { file: 'copies.js' })));

    expect(verdicts(findNearDuplicates(unitsOf(COPIES, 'copies.js')))).toEqual(expected);
  });

  it('reports a copied function with one changed literal as parameterizable', () => {
    const finding = findingFor(
      findNearDuplicates(unitsOf(TYPESCRIPT_COPIES, 'copies.ts')),
      'parseUrl',
    );

    expect(finding.verdict).toBe('parameterizable');
    expect(holes(finding)).toEqual([['value', '"empty uri"', '"empty url"']]);
  });

  it('reports a copied JSX element with different props as parameterizable', () => {
    const findings = findNearDuplicates(unitsOf(JSX_COPIES, 'copies.tsx'));
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
    const findings = findNearDuplicates(unitsOf(TYPESCRIPT_COPIES, 'copies.ts'));

    expect(findingFor(findings, 'saveDraft').verdict).toBe('partial-run');
    expect(findingFor(findings, 'importUsers').verdict).toBe('partial-run');
    expect(findingFor(findings, 'importUsers').run).toHaveLength(2);
  });

  it('treats renamed locals as the same code and differently imported helpers as a hole', () => {
    const findings = findNearDuplicates(unitsOf(TYPESCRIPT_COPIES, 'copies.ts'));
    const imported = findNearDuplicates([
      ...unitsOf(`import { formatDate } from './dates';\n${FORMAT_COPY}`, 'a.ts'),
      ...unitsOf(`import { formatDate } from './calendar';\n${FORMAT_COPY}`, 'b.ts'),
    ]);

    expect(findingFor(findings, 'totalPrice').verdict).toBe('same');
    expect(imported[0].parameters.map(({ a, b }) => [a.value, b.value])).toEqual([
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

    expect(withoutLines(typed[0].tree.children[2])).toEqual(
      withoutLines(plain[0].tree.children[2]),
    );
  });
});
