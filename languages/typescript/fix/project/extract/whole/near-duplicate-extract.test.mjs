import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { ts } from '../../../../typescript-api/typescript-api.mjs';
import { reuseFindingsFor } from '../../reuse/reuse-findings.mjs';
import { useFixtureProjects } from '../../test-support/fixture-project.mjs';
import {
  arrow,
  asyncCopy,
  copy,
  dates,
  loader,
  pair,
  twoMethods,
} from '../test-support/sources.mjs';
import { nearDuplicateExtractRecipe as recipe } from './near-duplicate-extract.mjs';

const projects = useFixtureProjects();

function fix(files) {
  return projects.fix(files, { recipe, rule: 'structure/near-duplicate' });
}

function remaining(result) {
  return reuseFindingsFor({ projectRoot: result.projectRoot }, 'near-duplicate');
}

function run(source) {
  const { outputText } = ts.transpileModule(source.replaceAll('export ', ''), {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  });
  return vm.runInNewContext(`${outputText}\n({ alignTop, alignBottom })`);
}

describe('nearDuplicateExtractRecipe', () => {
  it('is a safe recipe of project scope for the near-duplicate rule', () => {
    expect([recipe.safety, recipe.scope, recipe.rules]).toEqual([
      'safe',
      'project',
      [{ tool: 'structure', rule: 'near-duplicate' }],
    ]);
  });

  it('extracts a shared function after the first copy and calls it from both', () => {
    const result = fix({ 'src/align.ts': pair() });
    expect(result.tree['src/align.ts']).toMatchInlineSnapshot(`
      "export function alignTop(selection: string[], limit: number): string {
        return sharedAlignTop(selection, limit, 'top:');
      }

      function sharedAlignTop(selection: string[], limit: number, value: string): string {
        const selected = selection.filter((element) => element.length < limit);
        const label = selected.map((element) => element.trim()).join(',');
        const output = (label.length > 0 ? value : 'none:') + label + selected.length;
        return output.padEnd(limit, '-');
      }

      export function alignBottom(selection: string[], limit: number): string {
        return sharedAlignTop(selection, limit, 'bottom:');
      }
      "
    `);
    expect(remaining(result)).toEqual([]);
  });

  it('writes no types for a JavaScript file', () => {
    const javascript = `${copy('alignTop', { typed: false })}\n${copy('alignBottom', { typed: false, prefix: 'bottom:' })}`;
    expect(fix({ 'src/align.js': javascript }).tree['src/align.js']).toMatchInlineSnapshot(`
      "export function alignTop(selection, limit) {
        return sharedAlignTop(selection, limit, 'top:');
      }

      function sharedAlignTop(selection, limit, value) {
        const selected = selection.filter((element) => element.length < limit);
        const label = selected.map((element) => element.trim()).join(',');
        const output = (label.length > 0 ? value : 'none:') + label + selected.length;
        return output.padEnd(limit, '-');
      }

      export function alignBottom(selection, limit) {
        return sharedAlignTop(selection, limit, 'bottom:');
      }
      "
    `);
  });

  it('extracts copies that differ only in the names of locals', () => {
    const renamed = copy('alignBottom')
      .replaceAll('selected', 'chosen')
      .replaceAll('selection', 'input');
    const result = fix({ 'src/a.ts': `${copy('alignTop')}\n${renamed}` });
    expect(result.tree['src/a.ts']).toMatchInlineSnapshot(`
      "export function alignTop(selection: string[], limit: number): string {
        return sharedAlignTop(selection, limit);
      }

      function sharedAlignTop(selection: string[], limit: number): string {
        const selected = selection.filter((element) => element.length < limit);
        const label = selected.map((element) => element.trim()).join(',');
        const output = (label.length > 0 ? 'top:' : 'none:') + label + selected.length;
        return output.padEnd(limit, '-');
      }

      export function alignBottom(input: string[], limit: number): string {
        return sharedAlignTop(input, limit);
      }
      "
    `);
    expect(remaining(result)).toEqual([]);
  });

  it('keeps async and returns the promise of the shared function', () => {
    const source = `${asyncCopy('alignTop', 'top:')}\n${asyncCopy('alignBottom', 'bottom:')}`;
    expect(fix({ 'src/a.ts': source }).tree['src/a.ts']).toMatchInlineSnapshot(`
      "export async function alignTop(selection: string[], limit: number): Promise<string> {
        return sharedAlignTop(selection, limit, 'top:');
      }

      async function sharedAlignTop(selection: string[], limit: number, value: string): Promise<string> {
        const selected = selection.filter((element) => element.length < limit);
        const label = await Promise.resolve(selected.join(','));
        const output = (label.length > 0 ? value : 'none:') + label + selected.length;
        return output.padEnd(limit, '-');
      }

      export async function alignBottom(selection: string[], limit: number): Promise<string> {
        return sharedAlignTop(selection, limit, 'bottom:');
      }
      "
    `);
  });

  it('extracts arrow functions with expression bodies', () => {
    const source = `${arrow('byWeight', 'weight')}\n${arrow('byHeight', 'weight')}`;
    expect(fix({ 'src/a.ts': source }).tree['src/a.ts']).toMatchInlineSnapshot(`
      "export const byWeight = (rows: { tags: string[]; weight: number }[], floor: number) =>
        sharedByWeight(rows, floor);

      function sharedByWeight(rows: { tags: string[]; weight: number }[], floor: number) {
        return rows.filter((row) => row.weight > floor).map((row) => row.tags.join('-')).sort().slice(0, floor);
      }

      export const byHeight = (rows: { tags: string[]; weight: number }[], floor: number) =>
        sharedByWeight(rows, floor);
      "
    `);
  });

  it('extracts from methods that use no instance state', () => {
    expect(fix({ 'src/a.ts': twoMethods() }).tree['src/a.ts']).toMatchInlineSnapshot(`
      "export class Aligner {
        top(selection: string[], limit: number): string {
          return sharedTop(selection, limit, 'top:');
        }

        bottom(selection: string[], limit: number): string {
          return sharedTop(selection, limit, 'bottom:');
        }
      }

      function sharedTop(selection: string[], limit: number, value: string): string {
        const selected = selection.filter((element) => element.length < limit);
        const label = selected.map((element) => element.trim()).join(',');
        const output = (label.length > 0 ? value : 'none:') + label + selected.length;
        return output.padEnd(limit, '-');
      }
      "
    `);
  });

  it('passes a differing function as a thunk that is called where it was used', () => {
    const declarations =
      'declare function fetchUser(id: string): string;\ndeclare function fetchGroup(id: string): string;\n';
    const source = `${declarations}${loader('loadUsers', 'fetchUser')}\n${loader('loadGroups', 'fetchGroup')}`;
    expect(fix({ 'src/a.ts': source }).tree['src/a.ts']).toMatchInlineSnapshot(`
      "declare function fetchUser(id: string): string;
      declare function fetchGroup(id: string): string;
      export function loadUsers(ids: string[], limit: number): string[] {
        return sharedLoadUsers(ids, limit, () => fetchUser);
      }

      function sharedLoadUsers(ids: string[], limit: number, fetchUserValue: () => (id: string) => string): string[] {
        const found = ids.filter((id) => id.length < limit);
        const names = found.map((id) => fetchUserValue()(id));
        const total = names.length + found.length;
        return total > limit ? names.slice(0, limit) : names;
      }

      export function loadGroups(ids: string[], limit: number): string[] {
        return sharedLoadUsers(ids, limit, () => fetchGroup);
      }
      "
    `);
  });

  it('passes a literal inside the arguments of a constructor call', () => {
    const source = `${dates('morning', 'T06:00')}\n${dates('evening', 'T18:00')}`;
    expect(fix({ 'src/a.ts': source }).tree['src/a.ts']).toMatchInlineSnapshot(`
      "export function morning(ids: string[], limit: number): Date[] {
        return sharedMorning(ids, limit, 'T06:00');
      }

      function sharedMorning(ids: string[], limit: number, value: string): Date[] {
        const found = ids.filter((id) => id.length < limit);
        const dates = found.map((id) => new Date(id + value));
        const total = dates.length + found.length;
        return total > limit ? dates.slice(0, limit) : dates;
      }

      export function evening(ids: string[], limit: number): Date[] {
        return sharedMorning(ids, limit, 'T18:00');
      }
      "
    `);
  });

  it.each([
    [['a', 'bcd', 'efghij'], 4],
    [[], 6],
    [['  x '], 8],
  ])('returns what the copies returned for %j with limit %i', (selection, limit) => {
    const [before, after] = [pair(), fix({ 'src/a.ts': pair() }).tree['src/a.ts']].map(run);
    expect([after.alignTop(selection, limit), after.alignBottom(selection, limit)]).toEqual([
      before.alignTop(selection, limit),
      before.alignBottom(selection, limit),
    ]);
  });
});
