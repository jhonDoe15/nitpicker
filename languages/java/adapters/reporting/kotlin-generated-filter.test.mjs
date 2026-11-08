import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { EMPTY_MUTATION_FACTS } from '../test-support/fake-gradle/kotlin-empty-reports.mjs';
import { kotlinGeneratedFilter } from './kotlin-reports.mjs';

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

const USER = {
  file: 'src/main/kotlin/demo/User.kt',
  lines: 10,
  classes: [
    {
      name: 'demo.User',
      kind: 'class',
      start: 3,
      headerEnd: 3,
      init: false,
      serializable: false,
      functions: ['total'],
      properties: [
        {
          name: 'id',
          start: 3,
          end: 3,
          constructor: true,
          getter: false,
          setter: false,
          delegated: false,
        },
      ],
    },
  ],
  functions: [],
  lambdas: [],
  branching: [],
  casts: [],
  exhaustiveLastEntries: [],
};

function reportRoot(facts) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-kotlin-generated-')));
  roots.push(root);
  const reports = path.join(root, 'build/nitpicker');
  mkdirSync(reports, { recursive: true });
  if (facts !== undefined) {
    writeFileSync(path.join(reports, 'kotlin-mutation-facts.json'), JSON.stringify(facts));
  }
  return reports;
}

const mutant = (method, line) => ({
  className: 'demo.User',
  sourceFile: 'User.kt',
  method,
  methodDescription: '()I',
  mutatorName: 'PrimitiveReturnsMutator',
  description: `replaced int return with 0 for demo/User::${method}`,
  line,
});

function parseFailure(text) {
  try {
    JSON.parse(text);
  } catch (error) {
    return error.message;
  }
  throw new Error('the text is valid JSON');
}

function filterOf(reportRoot) {
  return kotlinGeneratedFilter({ reportRoot })([]);
}

describe('the Kotlin mutation filter of a report directory', () => {
  it('judges a mutant by the mutation facts the kotlin-psi program wrote beside the facts report', () => {
    const filter = filterOf(reportRoot({ files: [USER] }));

    expect([
      filter(mutant('getId', 3), USER.file),
      filter(mutant('total', 6), USER.file),
      filter(mutant('getId', 3), 'src/main/kotlin/demo/Other.kt'),
    ]).toEqual(['generated-accessor', undefined, undefined]);
  });

  it('accepts the report of a module without Kotlin files', () => {
    const filter = filterOf(reportRoot(JSON.parse(EMPTY_MUTATION_FACTS)));

    expect(filter(mutant('getId', 3), USER.file)).toBeUndefined();
  });

  it('needs that report, because without it the gate would count the compiler-generated mutants', () => {
    const missing = reportRoot();

    expect(() => kotlinGeneratedFilter({ reportRoot: missing })).toThrow(
      `The Kotlin mutation filter needs kotlin-mutation-facts.json in ${missing}. ` +
        'The kotlin-psi program writes it beside the facts report; ' +
        'a build tool that skips the program (no Kotlin files) must write {"files":[]} there.',
    );
  });

  it.each([
    ['{"files":[', parseFailure('{"files":[')],
    [
      '{"files":[{"file":"A.kt"}]}',
      'the entry of A.kt lacks lines, classes, functions, lambdas, branching, casts, exhaustiveLastEntries',
    ],
    ['{}', 'the report has no "files" list'],
  ])('refuses the report %s, naming it and the way to regenerate it', (text, reason) => {
    const reports = reportRoot();
    writeFileSync(path.join(reports, 'kotlin-mutation-facts.json'), text);

    expect(() => kotlinGeneratedFilter({ reportRoot: reports })).toThrow(
      `kotlin-mutation-facts.json in ${reports} is unusable (${reason}); run the kotlin-psi program again`,
    );
  });
});
