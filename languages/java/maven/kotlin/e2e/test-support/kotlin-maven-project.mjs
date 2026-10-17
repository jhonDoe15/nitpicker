import path from 'node:path';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { runJavaDiff } from '../../../../adapters/java-diff.mjs';
import {
  git,
  kotlinPolicy,
  writeAll,
} from '../../../../adapters/kotlin-e2e/test-support/kotlin-e2e-project.mjs';

export {
  commitBranch,
  commitFromBranch,
  commitFromStructureBase,
  detektFindingsOf,
  fromTool,
  git,
  kotlinE2eEnabled,
  kotlinPolicy,
  kotlinSources,
  ktlintOf,
  ktlintRules,
  onlyTools,
  removeProject,
  rulesOf,
  summarize,
  writeAll,
} from '../../../../adapters/kotlin-e2e/test-support/kotlin-e2e-project.mjs';

export const maven = process.env.NITPICKER_MAVEN;

const FIXTURES = path.resolve(import.meta.dirname, '../../../fixtures');

export function copyFixture(name) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-kotlin-maven-e2e-'));
  cpSync(path.join(FIXTURES, name), root, { recursive: true });
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

export function mavenDiffOf(project, branch, { policy = kotlinPolicy, base = 'main' } = {}) {
  git(project, 'checkout', '-q', branch);
  return runJavaDiff({ repositoryRoot: project.root, requestedBaseRef: base, maven, policy });
}

export function removeTree(root) {
  rmSync(root, { recursive: true, force: true });
}
