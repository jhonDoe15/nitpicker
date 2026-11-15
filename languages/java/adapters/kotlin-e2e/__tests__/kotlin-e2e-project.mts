import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import type { Finding } from '../../../../../shared/values/findings.mts';
import { runJavaDiff as typedRunJavaDiff } from '../../java-diff.mts';
import { callUntyped } from '../../typed/java-values.mts';
import { fieldOf, fieldsOf } from '../../../../../shared/values/readers.mts';
import { findingsOf } from '../../kotlin/rules/test-support/findings-list.mts';
import { schemaChecked as untypedSchemaChecked } from '../../../../../core/diff/comparison/test-support/findings-schema-check.mts';

export const kotlinE2eEnabled = process.env['NITPICKER_KOTLIN_E2E'] === '1';

export const gradle = process.env['NITPICKER_GRADLE'] || 'gradle';

export type KotlinProject = { readonly root: string };
export type KotlinPolicy = Readonly<Record<string, unknown>>;
export type FileMap = Readonly<Record<string, string | Uint8Array | undefined>>;
export type DiffResult = {
  readonly newFindings: Finding[];
  readonly newEnforceable: Finding[];
  readonly unchangedFindings: Finding[];
  readonly toolErrors: Finding[];
  readonly failed: boolean;
  readonly [field: string]: unknown;
};
export type DiffOptions = { readonly policy?: KotlinPolicy; readonly base?: string };
export type DiffInput = {
  readonly repositoryRoot: string;
  readonly requestedBaseRef: string;
  readonly gradle: string | undefined;
  readonly maven: string | undefined;
  readonly spawn: undefined;
  readonly initScript: undefined;
  readonly policy: KotlinPolicy;
};

export function runJavaDiff(input: DiffInput): DiffResult {
  const result = callUntyped(typedRunJavaDiff, input);
  return {
    ...fieldsOf(result),
    newFindings: findingsOf(fieldOf(result, 'newFindings')),
    newEnforceable: findingsOf(fieldOf(result, 'newEnforceable')),
    unchangedFindings: findingsOf(fieldOf(result, 'unchangedFindings')),
    toolErrors: findingsOf(fieldOf(result, 'toolErrors')),
    failed: fieldOf(result, 'failed') === true,
  };
}
const schemaChecked: (result: DiffResult) => DiffResult = untypedSchemaChecked;

const GIT_TIMEOUT_MS = 30_000;
const CHECKOUT = 'checkout';
const JDK_PROBE_TIMEOUT_MS = 30_000;
const JDK_COPY_TIMEOUT_MS = 120_000;

export const kotlinPolicy: KotlinPolicy = { preset: 'kotlin' };
export const kotlinPolicyWithProjectDetekt: KotlinPolicy = {
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

export function git(project: KotlinProject, ...args: string[]): string {
  return execFileSync('git', args, {
    cwd: project.root,
    encoding: 'utf8',
    env: { ...process.env, ...gitEnvironment },
    timeout: GIT_TIMEOUT_MS,
  });
}

export function writeAll(project: KotlinProject, files: FileMap): void {
  for (const [relative, content] of Object.entries(files)) {
    const target = path.resolve(project.root, relative);
    if (!target.startsWith(project.root + path.sep)) {
      throw new Error(`${relative} is outside ${project.root}`);
    }
    if (content === undefined) {
      rmSync(target);
    } else {
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, content);
    }
  }
}

function commitFiles(project: KotlinProject, name: string, files: FileMap): void {
  writeAll(project, files);
  git(project, 'add', '-A');
  git(project, 'commit', '-q', '-m', name);
}

export function commitBranch(project: KotlinProject, name: string, files: FileMap): void {
  git(project, CHECKOUT, '-q', '-b', name, 'main');
  commitFiles(project, name, files);
}

export function commitFromBranch(
  project: KotlinProject,
  { name, from, files }: { name: string; from: string; files: FileMap },
): void {
  git(project, CHECKOUT, '-q', '-b', name, from);
  commitFiles(project, name, files);
}

export function commitFromStructureBase(
  project: KotlinProject,
  name: string,
  files: FileMap,
): void {
  commitFromBranch(project, { name, from: 'structure-base', files });
}

export function initializeProject(): KotlinProject {
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

export function removeProject(project: KotlinProject): void {
  rmSync(project.root, { recursive: true, force: true });
}

export function diffOf(
  project: KotlinProject,
  branch: string,
  { policy = kotlinPolicy, base = 'main' }: DiffOptions = {},
): DiffResult {
  git(project, CHECKOUT, '-q', branch);
  return schemaChecked(
    runJavaDiff({
      repositoryRoot: project.root,
      requestedBaseRef: base,
      gradle,
      maven: undefined,
      spawn: undefined,
      initScript: undefined,
      policy,
    }),
  );
}

export function summarize(findings: readonly Finding[]): string[] {
  return findings
    .map(({ tool, rule, path: file }) => `${tool} ${rule} ${path.basename(file)}`)
    .sort();
}

export function fromTool(findings: readonly Finding[], tool: string): string[] {
  return summarize(findings.filter((finding) => finding.tool === tool));
}

export function ktlintOf(findings: readonly Finding[]): Finding[] {
  return findings.filter((finding) => finding.tool === 'ktlint');
}

export function ktlintRules(findings: readonly Finding[]): string[] {
  return [...new Set(ktlintOf(findings).map(({ rule }) => rule))].sort();
}

export function onlyTools(findings: readonly Finding[], ...tools: string[]): Finding[] {
  return findings.filter(({ tool }) => tools.includes(tool));
}

export function rulesOf(findings: readonly Finding[], ...tools: string[]): string[] {
  return onlyTools(findings, ...tools)
    .map(({ tool, rule, symbol, path: file }) =>
      [tool, rule, symbol ?? path.basename(file)].join(' '),
    )
    .sort();
}

export function detektFindingsOf(
  findings: readonly Finding[],
  testCase: { readonly id: string },
): Finding[] {
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

export function copyJdkWithNativeImage(target: string): string {
  const settings = spawnSync(
    'sh',
    ['-c', `exec "\${JAVA_HOME:+$JAVA_HOME/bin/}java" -XshowSettings:properties -version`],
    { encoding: 'utf8', timeout: JDK_PROBE_TIMEOUT_MS },
  );
  const home = /java\.home = (.+)/.exec(settings.stderr)?.[1];
  if (home === undefined) {
    throw new Error('java.home was not reported');
  }
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
