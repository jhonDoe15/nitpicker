import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { ts } from '../../../../typescript-api/typescript-api.mjs';
import { reuseFindingsFor } from '../../reuse/reuse-findings.mjs';
import { useFixtureProjects } from '../../test-support/fixture-project.mjs';
import { forcedPartialRecipe, spansOf } from '../test-support/forced.mjs';
import {
  headerCopy,
  headerPair,
  returningPair,
  validationCopy,
  validationPair,
} from '../test-support/partial-sources.mjs';
import { partialRunExtractRecipe as recipe } from './partial-run-extract.mjs';

const projects = useFixtureProjects();

function fix(files, use = recipe) {
  return projects.fix(files, { recipe: use, rule: 'structure/near-duplicate' });
}

function remaining(result) {
  return reuseFindingsFor({ projectRoot: result.projectRoot }, 'near-duplicate');
}

function load(source, names) {
  const { outputText } = ts.transpileModule(source.replaceAll('export ', ''), {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  });
  return vm.runInNewContext(`${outputText}\n({ ${names.join(', ')} })`);
}

function outcome(call) {
  try {
    return { value: call() };
  } catch (error) {
    return { thrown: error.message };
  }
}

function behaviours(source, calls) {
  const functions = load(source, [...new Set(calls.map(([name]) => name))]);
  return calls.map(([name, ...args]) => outcome(() => functions[name](...args)));
}

describe('partialRunExtractRecipe', () => {
  it('is a review recipe of project scope for the near-duplicate rule', () => {
    expect([recipe.safety, recipe.scope, recipe.rules]).toEqual([
      'review',
      'project',
      [{ tool: 'structure', rule: 'near-duplicate' }],
    ]);
  });

  it('keeps the line endings of a file that uses CRLF', () => {
    const result = fix({ 'src/a.ts': headerPair().replaceAll('\n', '\r\n') });
    const text = result.tree['src/a.ts'];
    expect([
      text.includes('sharedHeaderNamesSteps('),
      text.replaceAll('\r\n', '').includes('\n'),
    ]).toEqual([true, false]);
  });

  it('extracts a shared header loop that returns the one value used after it', () => {
    const result = fix({ 'src/a.ts': headerPair() });
    expect(result.tree['src/a.ts']).toMatchInlineSnapshot(`
      "export function headerNames(raw: string[], limit: number) {
        const names = sharedHeaderNamesSteps(raw, limit);
        return names.join(",");
      }

      function sharedHeaderNamesSteps(raw: string[], limit: number) {
        const headers: Record<string, string> = {};
        for (const line of raw) {
          const index = line.indexOf(':');
          if (index > 0 && Object.keys(headers).length < limit) {
            headers[line.slice(0, index).trim().toLowerCase()] = line.slice(index + 1).trim();
          }
        }
        const names = Object.keys(headers).sort();
        return names;
      }

      export function headerCount(raw: string[], limit: number) {
        const total = raw.length;
        const names = sharedHeaderNamesSteps(raw, limit);
        return names.length + total;
      }
      "
    `);
    expect(remaining(result)).toEqual([]);
  });

  it('keeps the results of both header readers', () => {
    const calls = [
      ['headerNames', ['a: 1', 'B:2', 'bad'], 5],
      ['headerCount', ['a: 1', 'B:2', 'bad'], 1],
      ['headerCount', [], 3],
    ];
    const source = headerPair();
    const after = fix({ 'src/a.ts': source }).tree['src/a.ts'];
    expect(behaviours(after, calls)).toEqual(behaviours(source, calls));
  });

  it('extracts a shared validation prefix and passes the message that differs', () => {
    const result = fix({ 'src/a.ts': validationPair() });
    expect(result.tree['src/a.ts']).toMatchInlineSnapshot(`
      "export function createUser(name: string, age: number) {
        const trimmed = sharedCreateUserSteps(name, age, 'name is required');
        return { name: trimmed, age };
      }

      function sharedCreateUserSteps(name: string, age: number, value: string) {
        if (name.length === 0) {
          throw new Error(value);
        }
        if (age < 0 || Number.isNaN(age)) {
          throw new Error('age must not be negative');
        }
        if (name.length > 64) {
          throw new Error('name is too long');
        }
        const trimmed = name.trim().toLowerCase();
        return trimmed;
      }

      export function renameUser(name: string, age: number) {
        const trimmed = sharedCreateUserSteps(name, age, 'new name is required');
        const label = trimmed + ':' + String(age);
        return label.toUpperCase();
      }
      "
    `);
  });

  it('keeps what both validators return and throw', () => {
    const calls = [
      ['createUser', 'Ann', 3],
      ['createUser', '', 3],
      ['createUser', 'Ann', -1],
      ['createUser', 'x'.repeat(65), 1],
      ['renameUser', 'Bob', 4],
      ['renameUser', '', 4],
    ];
    const source = validationPair();
    const after = fix({ 'src/a.ts': source }).tree['src/a.ts'];
    expect(behaviours(after, calls)).toEqual(behaviours(source, calls));
  });

  it('extracts a run that defines no value as a statement call', () => {
    const copies = [
      validationCopy('first', {
        message: 'name is required',
        binds: false,
        after: '  return name.length + age;',
      }),
      validationCopy('second', {
        message: 'new name is required',
        binds: false,
        after: '  const total = name.length * age;\n  return total;',
      }),
    ];
    expect(fix({ 'src/a.ts': copies.join('\n') }).tree['src/a.ts']).toMatchInlineSnapshot(`
      "export function first(name: string, age: number) {
        sharedFirstSteps(name, age, 'name is required');
        return name.length + age;
      }

      function sharedFirstSteps(name: string, age: number, value: string) {
        if (name.length === 0) {
          throw new Error(value);
        }
        if (age < 0 || Number.isNaN(age)) {
          throw new Error('age must not be negative');
        }
        if (name.length > 64) {
          throw new Error('name is too long');
        }
      }

      export function second(name: string, age: number) {
        sharedFirstSteps(name, age, 'new name is required');
        const total = name.length * age;
        return total;
      }
      "
    `);
  });

  it('writes no types for a JavaScript file', () => {
    const untyped = (text) =>
      text
        .replaceAll(': string[]', '')
        .replaceAll(': number', '')
        .replaceAll(': Record<string, string>', '');
    const result = fix({ 'src/a.js': untyped(headerPair()) });
    expect(result.tree['src/a.js']).toMatchInlineSnapshot(`
      "export function headerNames(raw, limit) {
        const names = sharedHeaderNamesSteps(raw, limit);
        return names.join(",");
      }

      function sharedHeaderNamesSteps(raw, limit) {
        const headers = {};
        for (const line of raw) {
          const index = line.indexOf(':');
          if (index > 0 && Object.keys(headers).length < limit) {
            headers[line.slice(0, index).trim().toLowerCase()] = line.slice(index + 1).trim();
          }
        }
        const names = Object.keys(headers).sort();
        return names;
      }

      export function headerCount(raw, limit) {
        const total = raw.length;
        const names = sharedHeaderNamesSteps(raw, limit);
        return names.length + total;
      }
      "
    `);
  });

  it('passes the name each copy uses for a value the run reads', () => {
    const renamed = headerCopy('headerCount', {
      before: '  const total = lines.length;',
      after: '  return names.length + total;',
    }).replaceAll('raw', 'lines');
    const source = [headerCopy('headerNames'), renamed].join('\n');
    expect(fix({ 'src/a.ts': source }).tree['src/a.ts']).toMatchInlineSnapshot(`
      "export function headerNames(raw: string[], limit: number) {
        const names = sharedHeaderNamesSteps(raw, limit);
        return names.join(",");
      }

      function sharedHeaderNamesSteps(raw: string[], limit: number) {
        const headers: Record<string, string> = {};
        for (const line of raw) {
          const index = line.indexOf(':');
          if (index > 0 && Object.keys(headers).length < limit) {
            headers[line.slice(0, index).trim().toLowerCase()] = line.slice(index + 1).trim();
          }
        }
        const names = Object.keys(headers).sort();
        return names;
      }

      export function headerCount(lines: string[], limit: number) {
        const total = lines.length;
        const names = sharedHeaderNamesSteps(lines, limit);
        return names.length + total;
      }
      "
    `);
  });

  it('turns a run that ends with return into a returned call', () => {
    const source = returningPair();
    const forced = forcedPartialRecipe({
      runs: spansOf(source, 'const headers', 'return names.join'),
    });
    expect(fix({ 'src/a.ts': source }, forced).tree['src/a.ts']).toMatchInlineSnapshot(`
      "export function headerLine(raw: string[], limit: number) {
        const total = raw.length;
        void total;
        return sharedForcedSteps(raw, limit);
      }

      function sharedForcedSteps(raw: string[], limit: number) {
        const headers: Record<string, string> = {};
        for (const line of raw) {
          const index = line.indexOf(':');
          if (index > 0 && Object.keys(headers).length < limit) {
            headers[line.slice(0, index).trim().toLowerCase()] = line.slice(index + 1).trim();
          }
        }
        const names = Object.keys(headers).sort();
        return names.join(',');
      }

      export function headerTrace(raw: string[], limit: number) {
        if (limit < 0) {
          return '';
        }
        return sharedForcedSteps(raw, limit);
      }
      "
    `);
  });
});
