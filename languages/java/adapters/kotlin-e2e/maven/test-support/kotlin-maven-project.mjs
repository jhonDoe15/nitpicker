import path from 'node:path';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { runJavaDiff } from '../../../java-diff.mjs';
import { git, kotlinPolicy, writeAll } from '../../test-support/kotlin-e2e-project.mjs';

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
} from '../../test-support/kotlin-e2e-project.mjs';

const FIXTURES = path.resolve(import.meta.dirname, '../../../../maven/fixtures');

export function copyFixture(name) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-kotlin-maven-e2e-'));
  const fixture = path.resolve(FIXTURES, name);
  if (!fixture.startsWith(FIXTURES + path.sep)) {
    throw new Error(`Fixture ${name} is outside ${FIXTURES}`);
  }
  cpSync(fixture, root, { recursive: true });
  return { root };
}

export function initializeMavenProject(name = 'kotlin-single') {
  const project = copyFixture(name);
  writeAll(project, { '.gitignore': 'target/\n' });
  git(project, 'init', '-q', '-b', 'main');
  git(project, 'add', '-A');
  git(project, 'commit', '-q', '-m', 'base with one legacy detekt finding');
  return project;
}

export function mavenDiffRunner(maven) {
  return function mavenDiffOf(project, branch, { policy = kotlinPolicy, base = 'main' } = {}) {
    git(project, 'checkout', '-q', branch);
    return runJavaDiff({ repositoryRoot: project.root, requestedBaseRef: base, maven, policy });
  };
}

export function removeTree(root) {
  rmSync(root, { recursive: true, force: true });
}
