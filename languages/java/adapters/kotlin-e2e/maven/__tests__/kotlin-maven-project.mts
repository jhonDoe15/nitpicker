import path from 'node:path';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import {
  git,
  kotlinPolicy,
  runJavaDiff,
  writeAll,
  type DiffOptions,
  type DiffResult,
  type KotlinProject,
} from '../../__tests__/kotlin-e2e-project.mts';

export {
  commitBranch,
  commitFromBranch,
  fromTool,
  git,
  kotlinE2eEnabled,
  kotlinPolicy,
  kotlinPolicyWithProjectDetekt,
  kotlinSources,
  ktlintOf,
  ktlintRules,
  onlyTools,
  removeProject,
  rulesOf,
  summarize,
  writeAll,
} from '../../__tests__/kotlin-e2e-project.mts';

const FIXTURES = path.resolve(import.meta.dirname, '../../../../maven/fixtures');

export function copyFixture(name: string): KotlinProject {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-kotlin-maven-e2e-'));
  const fixture = path.resolve(FIXTURES, name);
  if (!fixture.startsWith(FIXTURES + path.sep)) {
    throw new Error(`Fixture ${name} is outside ${FIXTURES}`);
  }
  cpSync(fixture, root, { recursive: true });
  return { root };
}

export function initializeMavenProject(name = 'kotlin-single'): KotlinProject {
  const project = copyFixture(name);
  writeAll(project, { '.gitignore': 'target/\n' });
  git(project, 'init', '-q', '-b', 'main');
  git(project, 'add', '-A');
  git(project, 'commit', '-q', '-m', 'base with one legacy detekt finding');
  return project;
}

export function mavenDiffRunner(
  maven: string | undefined,
): (project: KotlinProject, branch: string, options?: DiffOptions) => DiffResult {
  return function mavenDiffOf(project, branch, { policy = kotlinPolicy, base = 'main' } = {}) {
    git(project, 'checkout', '-q', branch);
    return runJavaDiff({
      repositoryRoot: project.root,
      requestedBaseRef: base,
      gradle: undefined,
      maven,
      spawn: undefined,
      initScript: undefined,
      policy,
    });
  };
}

export function removeTree(root: string): void {
  rmSync(root, { recursive: true, force: true });
}
