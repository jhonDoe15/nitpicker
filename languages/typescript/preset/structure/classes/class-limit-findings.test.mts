import { beforeEach, describe, expect, it } from 'vitest';
import {
  type PolicyInput,
  headPolicyEnvironment,
  withHeadPolicyFile,
} from '../test-support/policy-views.mts';
import { useTemporaryProjects, writeProjectFiles } from '../../test-support/temporary-projects.mts';
import { typescriptClassLimitFindings } from './class-limit-findings.mts';

const { emptyProject } = useTemporaryProjects('nitpicker-ts-class-limits-');
let projectRoot: string;

function findingsWith(files: Record<string, string>, policy: PolicyInput = {}) {
  writeProjectFiles(projectRoot, files);
  return withHeadPolicyFile(policy, (policyFile) =>
    typescriptClassLimitFindings(projectRoot, 'structure', headPolicyEnvironment(policyFile)).map(
      ({ rule, path: findingPath, identity }) => [rule, findingPath, identity],
    ),
  );
}

function methods(count: number, prefix = 'm'): string {
  return Array.from({ length: count }, (_, index) => `  ${prefix}${String(index)}() {}\n`).join('');
}

function fields(count: number): string {
  return Array.from(
    { length: count },
    (_, index) => `  f${String(index)} = ${String(index)};\n`,
  ).join('');
}

describe('TypeScript class limits', () => {
  beforeEach(() => {
    projectRoot = emptyProject();
  });

  it('reports a class over the method limit and not one at it, counting accessors and static methods', () => {
    const findings = findingsWith({
      'src/over.ts': `export class Over {\n  constructor() {}\n${methods(19)}  get a() { return 1; }\n  static s() {}\n}\n`,
      'src/at.ts': `export class At {\n  constructor() {}\n${methods(18)}  get a() { return 1; }\n  static s() {}\n}\n`,
    });

    expect(findings).toEqual([
      ['class-methods-limit', 'src/over.ts', 'methods:Over:occurrence:1:21'],
    ]);
  });

  it('does not count overload signatures, only the implementation', () => {
    const overloads =
      '  run(a: string): void;\n  run(a: number): void;\n  run(a: unknown): void {}\n';

    expect(findingsWith({ 'src/a.ts': `export class A {\n${overloads}${methods(19)}}\n` })).toEqual(
      [],
    );
  });

  it('counts instance fields and constructor parameter properties but not static ones', () => {
    const findings = findingsWith({
      'src/over.ts': `export class Over {\n${fields(9)}  static shared = 1;\n  constructor(private readonly a: number, b: number, public c = 1) {}\n}\n`,
      'src/at.ts': `export class At {\n${fields(9)}  static shared = 1;\n  constructor(private readonly a: number, b: number) {}\n}\n`,
    });

    expect(findings).toEqual([
      ['class-fields-limit', 'src/over.ts', 'fields:Over:occurrence:1:11'],
    ]);
  });

  it('counts class expressions like declarations and ignores object literals', () => {
    const findings = findingsWith({
      'src/expr.ts': `export const Wide = class {\n${methods(21)}};\nexport const bag = {\n${methods(21).replaceAll('() {}', ': () => 1,')}};\n`,
    });

    expect(findings).toEqual([
      ['class-methods-limit', 'src/expr.ts', 'methods:Wide:occurrence:1:21'],
    ]);
  });

  it('measures the extends chain through project classes, imports and re-exports', () => {
    const files = {
      'src/a.ts': 'export class A {}\n',
      'src/b.ts': "import { A } from './a';\nexport class B extends A {}\n",
      'src/index.ts': "export { B } from './b';\n",
      'src/c.ts': "import { B } from './index';\nexport class C extends B {}\n",
      'src/d.ts': "import * as c from './c';\nexport class D extends c.C {}\n",
    };

    expect(findingsWith(files, { thresholds: { inheritanceDepth: 2 } })).toEqual([
      ['inheritance-depth-limit', 'src/d.ts', 'inheritanceDepth:D:occurrence:1:3'],
    ]);
    expect(findingsWith({}, { thresholds: { inheritanceDepth: 3 } })).toEqual([]);
  });

  it('counts a library base class as one level and ends the chain there', () => {
    const files = {
      'src/a.ts': "import { Base } from 'some-library';\nexport class A extends Base {}\n",
      'src/b.ts': "import { A } from './a';\nexport class B extends A {}\n",
      'src/c.ts': 'export class C extends Missing {}\nexport class D extends mixin(C) {}\n',
    };

    expect(findingsWith(files, { thresholds: { inheritanceDepth: 1 } })).toEqual([
      ['inheritance-depth-limit', 'src/b.ts', 'inheritanceDepth:B:occurrence:1:2'],
    ]);
  });

  it('stops at an inheritance cycle instead of looping', () => {
    const files = {
      'src/a.ts': "import { B } from './b';\nexport class A extends B {}\n",
      'src/b.ts': "import { A } from './a';\nexport class B extends A {}\n",
    };

    expect(findingsWith(files, { thresholds: { inheritanceDepth: 1 } })).toEqual([
      ['inheritance-depth-limit', 'src/a.ts', 'inheritanceDepth:A:occurrence:1:2'],
      ['inheritance-depth-limit', 'src/b.ts', 'inheritanceDepth:B:occurrence:1:2'],
    ]);
  });

  it('honours thresholds and exceptions, and skips test files', () => {
    const files = {
      'src/a.ts': `export class A {\n${methods(5)}}\n`,
      'src/a.test.ts': `export class T {\n${methods(30)}}\n`,
    };

    expect(findingsWith(files, { thresholds: { classMethods: 4 } })).toEqual([
      ['class-methods-limit', 'src/a.ts', 'methods:A:occurrence:1:5'],
    ]);
    expect(
      findingsWith(
        {},
        {
          thresholds: { classMethods: 4 },
          exceptions: [{ rule: 'class-methods-limit', paths: ['src/a.ts'], reason: 'x' }],
        },
      ),
    ).toEqual([]);
  });
});
