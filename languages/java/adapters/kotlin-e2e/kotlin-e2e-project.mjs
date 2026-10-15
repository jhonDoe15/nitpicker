import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { runJavaDiff } from '../java-diff.mjs';

// End-to-end tests of the Kotlin preset run on a small mixed Kotlin and Java Gradle project. They need
// Java 21, Gradle, lizard (see java-preset.e2e.test.mjs) and network access to Maven Central and
// the Gradle plugin portal (the Kotlin Gradle plugin, detekt, ktlint and ktfmt are downloaded on
// the first run), so they only run with NITPICKER_KOTLIN_E2E=1 (`npm run test:kotlin`).
// NITPICKER_GRADLE overrides `gradle`. The script raises the test timeout to 15 minutes per step.

export const kotlinE2eEnabled = process.env.NITPICKER_KOTLIN_E2E === '1';

export const gradle = process.env.NITPICKER_GRADLE ?? 'gradle';

export const kotlinPolicy = { preset: 'kotlin' };

export const kotlinSources = 'src/main/kotlin/demo';

export function createKotlinProject() {
  let root;

  function git(...args) {
    return execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_AUTHOR_NAME: 'fixture',
        GIT_AUTHOR_EMAIL: 'fixture@example.com',
        GIT_COMMITTER_NAME: 'fixture',
        GIT_COMMITTER_EMAIL: 'fixture@example.com',
      },
    });
  }

  function writeAll(files) {
    for (const [relative, content] of Object.entries(files)) {
      const target = path.join(root, relative);
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, content);
    }
  }

  function commitBranch(name, files, removed = [], from = 'main') {
    git('checkout', '-q', '-b', name, from);
    writeAll(files);
    for (const relative of removed) {
      rmSync(path.join(root, relative));
    }
    git('add', '-A');
    git('commit', '-q', '-m', name);
  }

  return {
    get root() {
      return root;
    },
    git,
    writeAll,
    commitBranch,
    commitFromStructureBase: (name, files) => commitBranch(name, files, [], 'structure-base'),
    initialize() {
      root = mkdtempSync(path.join(tmpdir(), 'nitpicker-kotlin-e2e-'));
      cpSync(path.resolve(import.meta.dirname, '../fixtures/kotlin-project'), root, {
        recursive: true,
      });
      writeAll({ '.gitignore': '/build/\n/.gradle/\n/.kotlin/\n' });
      git('init', '-q', '-b', 'main');
      git('add', '-A');
      git('commit', '-q', '-m', 'base with one legacy detekt finding');
    },
    remove() {
      rmSync(root, { recursive: true, force: true });
    },
    diffOf(branch, policy = kotlinPolicy, base = 'main') {
      git('checkout', '-q', branch);
      return runJavaDiff({ repositoryRoot: root, requestedBaseRef: base, gradle, policy });
    },
  };
}

export const summarize = (findings) =>
  findings.map(({ tool, rule, path: file }) => `${tool} ${rule} ${path.basename(file)}`).sort();

export const fromTool = (findings, tool) =>
  summarize(findings.filter((finding) => finding.tool === tool));

export const ktlintOf = (findings) => findings.filter((finding) => finding.tool === 'ktlint');

export const ktlintRules = (findings) =>
  [...new Set(ktlintOf(findings).map(({ rule }) => rule))].sort();

export const onlyTools = (findings, ...tools) =>
  findings.filter(({ tool }) => tools.includes(tool));

export const rulesOf = (findings, ...tools) =>
  onlyTools(findings, ...tools)
    .map(({ tool, rule, symbol, path: file }) =>
      [tool, rule, symbol ?? path.basename(file)].join(' '),
    )
    .sort();

export const detektFindingsOf = (findings, testCase) =>
  findings.filter(
    ({ tool, path: file }) => tool === 'detekt' && file.includes(`/demo/${testCase.id}/`),
  );
