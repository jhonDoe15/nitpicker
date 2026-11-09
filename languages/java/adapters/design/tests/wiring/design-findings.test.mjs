import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DESIGN_RULES } from '../../../../../../shared/project-rules/design/design-rules.mjs';
import { DESIGN_FACTS_FAILURE_RULE, designFindings, designPolicy } from '../../design-findings.mjs';
import {
  designPackages,
  designSourceFiles,
  markPublished,
  produceDesignFacts,
} from '../../producer/design-facts.mjs';
import { fixtureRoot } from '../../test-support/design-facts-support.mjs';

const MODULES = [
  { dir: 'core', sourceRoots: ['core/src/main/java'], published: true },
  { dir: 'app', sourceRoots: ['app/src/main/java'], published: false },
];

const SINGLE = [{ dir: '', sourceRoots: ['src/main/java'], published: false }];
const FAILURE_PREFIX = 'The design rules could not read the Java sources: ';
const work = [];

function recorder() {
  const calls = [];
  return { calls, evaluate: (...args) => calls.push(args) && [] };
}

function brokenProject(source) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-design-test-'));
  work.push(root);
  mkdirSync(path.join(root, 'src/main/java/broken'), { recursive: true });
  writeFileSync(path.join(root, 'src/main/java/broken/Broken.java'), source);
  return root;
}

afterEach(() => {
  for (const root of work.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('design findings for Java', () => {
  it('hands the bundle, the language, the analyzer and every design rule to the shared evaluator', () => {
    const exceptions = [{ rule: 'data-clump', paths: ['app/**'] }];
    const { calls, evaluate } = recorder();

    const findings = designFindings({
      projectRoot: fixtureRoot('modules'),
      listModules: () => MODULES,
      policy: { exceptions },
      evaluate,
    });

    expect(findings).toEqual([]);
    expect(calls.length).toBe(1);
    const [[facts, options]] = calls;
    expect(Object.keys(facts).toSorted()).toEqual(['callables', 'modules', 'packages', 'types']);
    expect(facts.packages).toEqual([
      { root: 'core', published: true },
      { root: 'app', published: false },
    ]);
    expect(options).toEqual({
      language: 'java',
      analyzerName: 'java',
      policy: designPolicy({ exceptions }),
      rules: DESIGN_RULES,
    });
  });

  it('reads the design settings of the head policy next to the exceptions of the run', () => {
    const head = { exceptions: [{ rule: 'x', paths: ['y'] }], protocols: [{ open: 'a' }] };

    expect(designPolicy({ exceptions: [] }, head)).toEqual({ ...head, exceptions: [] });
    expect(designPolicy({}, head)).toEqual(head);
    expect(designPolicy({}, {})).toEqual({ exceptions: [] });
    expect(designPolicy({ protocols: [{ open: 'b' }] }, head)).toEqual({
      ...head,
      protocols: [{ open: 'b' }],
    });
  });

  it('writes the bundle to the requested file', () => {
    const root = brokenProject('package broken;\npublic class Broken {}\n');
    const output = path.join(root, 'out/design-facts.json');

    designFindings({
      projectRoot: root,
      listModules: () => SINGLE,
      policy: {},
      output,
    });

    expect(JSON.parse(readFileSync(output, 'utf8'))).toEqual({
      modules: [{ file: 'src/main/java/broken/Broken.java', role: 'production' }],
      types: [
        {
          id: 'src/main/java/broken/Broken.java#Broken',
          file: 'src/main/java/broken/Broken.java',
          name: 'Broken',
          line: 2,
          kind: 'data',
          exported: true,
          fields: [],
        },
      ],
      callables: [],
      packages: [],
    });
  });

  it.each([
    ['a source that does not parse', 'package broken;\npublic class Broken { void run( { }\n'],
    ['an unfinished class', 'package broken;\npublic class Broken {\n'],
  ])('reports %s as a tool error instead of failing the run', (_name, source) => {
    const { calls, evaluate } = recorder();

    const findings = designFindings({
      projectRoot: brokenProject(source),
      listModules: () => SINGLE,
      policy: {},
      evaluate,
    });

    expect(findings).toEqual([
      {
        tool: 'java',
        rule: DESIGN_FACTS_FAILURE_RULE,
        path: '.',
        identity: DESIGN_FACTS_FAILURE_RULE,
        message: expect.any(String),
        classification: 'tool-error',
      },
    ]);
    expect(findings[0].message.startsWith(`${FAILURE_PREFIX}DesignFacts`)).toBe(true);
    expect(calls).toEqual([]);
  });

  it('writes an empty bundle for modules without Java sources', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-design-test-'));
    work.push(root);
    const output = path.join(root, 'out/design-facts.json');
    const empty = { modules: [], types: [], callables: [], packages: [] };

    expect([
      produceDesignFacts({ projectRoot: root, modules: SINGLE, output }),
      JSON.parse(readFileSync(output, 'utf8')),
    ]).toEqual([empty, empty]);
  });

  it('stays silent for the Kotlin preset', () => {
    const { calls, evaluate } = recorder();

    expect(
      designFindings({
        projectRoot: fixtureRoot('modules'),
        listModules: () => MODULES,
        policy: {},
        analyzerName: 'kotlin',
        evaluate,
      }),
    ).toEqual([]);
    expect(calls).toEqual([]);
  });
});

describe('design sources', () => {
  it('lists the Java files of the given roots, skipping module descriptors', () => {
    const root = brokenProject('class A {}');
    writeFileSync(path.join(root, 'src/main/java/module-info.java'), 'module m {}');
    writeFileSync(path.join(root, 'src/main/java/broken/package-info.java'), 'package broken;');

    expect(
      designSourceFiles(root, [
        { dir: '', sourceRoots: ['src/main/java', 'src/none'], published: false },
      ]),
    ).toEqual(['src/main/java/broken/Broken.java']);
  });

  it('marks the exported types of a published module, and only those, as published', () => {
    const type = (file, exported) => ({ id: `${file}#T`, file, exported });

    expect(
      markPublished(
        [
          type('core/src/main/java/core/A.java', true),
          type('core/src/main/java/core/B.java', false),
          type('app/src/main/java/app/C.java', true),
          type('core-extra/src/main/java/D.java', true),
        ],
        MODULES,
      ),
    ).toEqual([
      { ...type('core/src/main/java/core/A.java', true), published: true },
      type('core/src/main/java/core/B.java', false),
      type('app/src/main/java/app/C.java', true),
      type('core-extra/src/main/java/D.java', true),
    ]);
  });

  it.each([
    ['one module', MODULES.slice(0, 1), []],
    [
      'several modules',
      MODULES,
      [
        { root: 'core', published: true },
        { root: 'app', published: false },
      ],
    ],
  ])('lists packages for %s', (_name, modules, expected) => {
    expect(designPackages(modules)).toEqual(expected);
  });
});
