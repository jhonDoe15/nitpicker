import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { runJavaDiff } from '../../java-diff.mjs';
import { schemaChecked } from '../../../../../core/diff/comparison/test-support/findings-schema-check.mjs';

const GIT_TIMEOUT_MS = 30_000;
const JDK_PROBE_TIMEOUT_MS = 30_000;
const JDK_COPY_TIMEOUT_MS = 120_000;

export const kotlinE2eEnabled = process.env.NITPICKER_KOTLIN_E2E === '1';

export const gradle = process.env.NITPICKER_GRADLE ?? 'gradle';

export const kotlinPolicy = { preset: 'kotlin' };
export const kotlinPolicyWithProjectDetekt = {
  preset: 'kotlin',
  toolPrecedence: { detekt: ['project', 'nitpicker'] },
};

export const kotlinSources = 'src/main/kotlin/demo';

const gitEnvironment = {
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'fixture',
  GIT_AUTHOR_EMAIL: 'fixture@example.com',
  GIT_COMMITTER_NAME: 'fixture',
  GIT_COMMITTER_EMAIL: 'fixture@example.com',
};

export function git(project, ...args) {
  return execFileSync('git', args, {
    cwd: project.root,
    encoding: 'utf8',
    env: { ...process.env, ...gitEnvironment },
    timeout: GIT_TIMEOUT_MS,
  });
}

export function writeAll(project, files) {
  for (const [relative, content] of Object.entries(files)) {
    const target = path.join(project.root, relative);
    if (content === null) {
      rmSync(target);
    } else {
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, content);
    }
  }
}

function commitFiles(project, name, files) {
  writeAll(project, files);
  git(project, 'add', '-A');
  git(project, 'commit', '-q', '-m', name);
}

export function commitBranch(project, name, files) {
  git(project, 'checkout', '-q', '-b', name, 'main');
  commitFiles(project, name, files);
}

export function commitFromBranch(project, { name, from, files }) {
  git(project, 'checkout', '-q', '-b', name, from);
  commitFiles(project, name, files);
}

export function commitFromStructureBase(project, name, files) {
  commitFromBranch(project, { name, from: 'structure-base', files });
}

export function initializeProject() {
  const project = { root: mkdtempSync(path.join(tmpdir(), 'nitpicker-kotlin-e2e-')) };
  cpSync(path.resolve(import.meta.dirname, '../../fixtures/kotlin-project'), project.root, {
    recursive: true,
  });
  writeAll(project, { '.gitignore': '/build/\n/.gradle/\n/.kotlin/\n' });
  git(project, 'init', '-q', '-b', 'main');
  git(project, 'add', '-A');
  git(project, 'commit', '-q', '-m', 'base with one legacy detekt finding');
  return project;
}

export function removeProject(project) {
  rmSync(project.root, { recursive: true, force: true });
}

export function diffOf(project, branch, { policy = kotlinPolicy, base = 'main' } = {}) {
  git(project, 'checkout', '-q', branch);
  return schemaChecked(
    runJavaDiff({ repositoryRoot: project.root, requestedBaseRef: base, gradle, policy }),
  );
}

export function summarize(findings) {
  return findings
    .map(({ tool, rule, path: file }) => `${tool} ${rule} ${path.basename(file)}`)
    .sort();
}

export function fromTool(findings, tool) {
  return summarize(findings.filter((finding) => finding.tool === tool));
}

export function ktlintOf(findings) {
  return findings.filter((finding) => finding.tool === 'ktlint');
}

export function ktlintRules(findings) {
  return [...new Set(ktlintOf(findings).map(({ rule }) => rule))].sort();
}

export function onlyTools(findings, ...tools) {
  return findings.filter(({ tool }) => tools.includes(tool));
}

export function rulesOf(findings, ...tools) {
  return onlyTools(findings, ...tools)
    .map(({ tool, rule, symbol, path: file }) =>
      [tool, rule, symbol ?? path.basename(file)].join(' '),
    )
    .sort();
}

export function detektFindingsOf(findings, testCase) {
  return findings.filter(
    ({ tool, path: file }) => tool === 'detekt' && file.includes(`/demo/${testCase.id}/`),
  );
}

export const JDK_PROBE = `
tasks.matching { it.name == "nitpickerDetekt" }.configureEach {
    doLast {
        val args = (this as JavaExec).args.orEmpty()
        val out = layout.buildDirectory.get().asFile
        out.resolve("jdk-home.txt").writeText(args[args.indexOf("--jdk-home") + 1])
        out.resolve("gradle-jvm-home.txt").writeText(System.getProperty("java.home"))
    }
}
`;

export function copyJdkWithNativeImage(target) {
  const settings = spawnSync(
    'sh',
    ['-c', 'exec "${JAVA_HOME:+$JAVA_HOME/bin/}java" -XshowSettings:properties -version'],
    { encoding: 'utf8', timeout: JDK_PROBE_TIMEOUT_MS },
  );
  const home = /java\.home = (.+)/.exec(settings.stderr)[1];
  execFileSync('cp', ['-a', home, target], { timeout: JDK_COPY_TIMEOUT_MS });
  writeFileSync(path.join(target, 'bin/native-image'), '#!/bin/sh\n', { mode: 0o755 });
  return target;
}

export const TOOLCHAIN_PROBE = `
kotlin {
    jvmToolchain {
        languageVersion.set(JavaLanguageVersion.of(21))
        nativeImageCapable.set(true)
    }
}

tasks.matching { it.name == "nitpickerDetekt" }.configureEach {
    doLast {
        layout.buildDirectory.get().asFile.resolve("toolchain-home.txt").writeText(
            javaToolchains.launcherFor(java.toolchain).get().metadata.installationPath.asFile.absolutePath,
        )
    }
}
`;
