import { describe, expect, it } from 'vitest';
import cases from './fixtures/code-fix-cases.json' with { type: 'json' };
import { candidateFiles, codeName, codeFixes, selectedCodeFixes } from './code-fix-rules.mjs';
import { useCodeFixProjects } from './test-support/code-fix-project.mjs';

const fixes = useCodeFixProjects();

const expected = {
  'missing-import': {
    rule: 'TS2304',
    text: 'import { helper } from "./lib.js";\n\nexport function run(): number {\n  return helper();\n}\n',
  },
  'unused-declaration': {
    rule: 'TS6133',
    text: 'export function run(): number {\n  return 1;\n}\n',
  },
  'missing-await': {
    rule: 'TS2345',
    text: "import { load } from './lib.js';\n\nexport async function run(): Promise<number> {\n  return Math.abs(await load());\n}\n",
  },
  'missing-async': {
    rule: 'TS1308',
    text: "import { load } from './lib.js';\n\nexport async function run() {\n  return await load();\n}\n",
  },
  'missing-const': {
    rule: 'TS2304',
    text: 'export function run(): number {\n  const total = 4;\n  return total;\n}\n',
  },
  'add-override': {
    rule: 'TS4114',
    text: 'class Base {\n  run(): void {}\n}\n\nexport class Child extends Base {\n  override run(): void {}\n}\n',
  },
  'remove-override': {
    rule: 'TS4113',
    text: 'class Base {\n  run(): void {}\n}\n\nexport class Child extends Base {\n  walk(): void {}\n}\n',
  },
};

function selecting(id) {
  return [codeName(Number(expected[id].rule.slice(2)))];
}

describe('planCodeFixes', () => {
  it.each(Object.keys(expected))('turns the %s case into the allowed form', (id) => {
    const { texts, applied } = fixes(cases[id], { selectedRules: selecting(id) });

    expect(texts.get('src/a.ts')).toBe(expected[id].text);
    expect(applied.map(({ rule }) => rule)).toContain(codeName(Number(expected[id].rule.slice(2))));
  });

  it('removes an unused import but keeps the one in use', () => {
    const { texts } = fixes(cases['unused-import'], { selectedRules: [codeName(6133)] });

    expect(texts.get('src/a.ts')).toBe(
      "import { basename } from 'node:path';\n\nexport function run(): string {\n  return basename('a');\n}\n",
    );
  });

  it('applies the safe override fix when no rule is selected', () => {
    expect(fixes(cases['add-override']).texts.get('src/a.ts')).toBe(expected['add-override'].text);
  });

  it.each(['missing-import', 'unused-declaration', 'missing-await', 'remove-override'])(
    'leaves the review case %s alone when no rule is selected',
    (id) => {
      expect(fixes(cases[id]).texts.size).toBe(0);
    },
  );

  it('applies only the selected codes', () => {
    const { texts } = fixes(cases['unused-declaration'], { selectedRules: [codeName(2304)] });

    expect(texts.size).toBe(0);
  });

  it('leaves a missing name alone when two modules could provide it', () => {
    const { texts } = fixes(cases['ambiguous-import'], { selectedRules: [codeName(2304)] });

    expect(texts.size).toBe(0);
  });

  it('leaves a file with a syntax error alone', () => {
    const files = { 'src/a.ts': 'export function run( {\n  total = 4;\n}\n' };

    expect(fixes(files, { selectedRules: [codeName(2304)] }).texts.size).toBe(0);
  });

  it('fixes JSDoc-typed JavaScript when the layout is JavaScript', () => {
    const files = {
      'src/a.js':
        "import path from 'node:path';\nimport { basename } from 'node:path';\n\n/** @returns {string} */\nexport function run() {\n  return basename('a');\n}\n",
    };
    const { texts } = fixes(files, {
      target: 'src/a.js',
      javascript: true,
      selectedRules: [codeName(6133)],
    });

    expect(texts.get('src/a.js')).toBe(
      "import { basename } from 'node:path';\n\n/** @returns {string} */\nexport function run() {\n  return basename('a');\n}\n",
    );
  });

  it('keeps an unused variable whose initializer calls something', () => {
    const files = {
      'src/a.ts':
        'export function run(db: { save(): number }): number {\n  const saved = db.save();\n  const spare = 1;\n  return 2;\n}\n',
    };
    const { texts } = fixes(files, { selectedRules: [codeName(6133)] });

    expect(texts.get('src/a.ts')).toBe(
      'export function run(db: { save(): number }): number {\n  const saved = db.save();\n  return 2;\n}\n',
    );
  });

  it('keeps an unused parameter of an exported function or a public method', () => {
    const files = {
      'src/a.ts':
        'export function run(used: number, extra: string): number {\n  return used;\n}\nfunction local(a: number, b: number): number {\n  return a;\n}\nexport { local };\nexport class Box {\n  open(path: string, mode: string): string {\n    return path;\n  }\n}\n',
    };

    expect(fixes(files, { selectedRules: [codeName(6133)] }).texts.size).toBe(0);
  });

  it('looks only at files that can need an override fix when no rule is selected', () => {
    const files = [
      { name: 'a.ts', text: 'export const a = 1;\n' },
      { name: 'b.ts', text: 'export class B extends A {}\n' },
    ];

    expect(candidateFiles(selectedCodeFixes([]), files).map(({ name }) => name)).toEqual(['b.ts']);
    expect(candidateFiles(codeFixes, files)).toEqual(files);
  });
});
