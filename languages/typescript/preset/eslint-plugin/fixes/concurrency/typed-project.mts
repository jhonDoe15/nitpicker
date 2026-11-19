import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll } from 'vitest';
import {
  typedCases,
  type CaseError,
  type InvalidCase,
  type TypedCases,
} from '../../test-support/typed-cases.mts';

const KEPT: CaseError[] = [{ messageId: 'unbounded' }];

export function typedProject(
  prefix: string,
  manifest: Readonly<Record<string, unknown>>,
): TypedCases {
  const cases = typedCases(prefix);
  const root = path.dirname(path.dirname(cases.typed('').filename));
  writeFileSync(path.join(root, 'package.json'), JSON.stringify(manifest));
  return cases;
}

export type DependencyProjects = Readonly<
  Record<'esm' | 'missing' | 'devOnly' | 'commonjs' | 'oldCommonjs', TypedCases>
>;

export type DependencyVersions = {
  readonly esm: string;
  readonly commonjs: string;
  readonly oldCommonjs: string;
};

export function dependencyProjects(name: string, versions: DependencyVersions): DependencyProjects {
  const projects = {
    esm: typedProject(`${name}-keep-`, { type: 'module', dependencies: { [name]: versions.esm } }),
    missing: typedProject(`${name}-none-`, { type: 'module', dependencies: { got: '^1.0.0' } }),
    devOnly: typedProject(`${name}-dev-`, {
      type: 'module',
      devDependencies: { [name]: versions.esm },
    }),
    commonjs: typedProject(`${name}-cjs-`, { dependencies: { [name]: versions.commonjs } }),
    oldCommonjs: typedProject(`${name}-old-`, { dependencies: { [name]: versions.oldCommonjs } }),
  };
  cleanupAfterAll(Object.values(projects));
  return projects;
}

export function cleanupAfterAll(projects: readonly TypedCases[]): void {
  afterAll(() => {
    for (const project of projects) {
      project.cleanup();
    }
  });
}

export function kept(project: TypedCases, code: string): InvalidCase {
  return project.typed(code, KEPT);
}
