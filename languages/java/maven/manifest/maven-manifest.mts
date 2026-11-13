import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { springFacts } from '../spring/arch-rules-gate.mjs';
import { relativeRoots } from '../module/module-paths.mjs';
import { fieldOf, fieldsOf, textsOf } from '../../../../shared/values/readers.mts';
import type { Classpaths, MavenModule } from '../typed/maven-values.mts';

type ManifestRequest = {
  readonly module: MavenModule;
  readonly classpaths: Classpaths;
  readonly pinned: unknown;
};
type ManifestWrite = {
  readonly reportDir: string;
  readonly manifest: Readonly<Record<string, unknown>>;
  readonly testsFailed: boolean;
};

const GUAVA_JAR = /^guava-\d.*\.jar$/u;
const AWAITILITY_JAR = /^awaitility-\d.*\.jar$/u;
const REACTOR_JAR = /^reactor-core-.*\.jar$/u;

function hasJar(classpath: readonly string[], jar: RegExp): boolean {
  return classpath.some((entry) => jar.test(path.basename(entry)));
}

export function usesReactor(classpaths: Classpaths): boolean {
  return hasJar(classpaths.mainCompile, REACTOR_JAR);
}

function rootsOf(module: MavenModule, list: string): string[] {
  return textsOf(module[list]);
}

function kotlinOnly(module: MavenModule, list: string): string[] {
  const own = rootsOf(module, list);
  return textsOf(fieldOf(module['kotlin'], list)).filter((root) => !own.includes(root));
}

function springClasspath(classpaths: Classpaths): string[] {
  const testRuntime = textsOf(fieldOf(classpaths, 'testRuntime'));
  const testCompile = textsOf(fieldOf(classpaths, 'testCompile'));
  return [...new Set([...testRuntime, ...classpaths.mainCompile, ...testCompile])];
}

function relative(module: MavenModule, roots: readonly string[]): unknown {
  return relativeRoots(module, roots);
}

export function moduleManifest({
  module,
  classpaths,
  pinned,
}: ManifestRequest): Readonly<Record<string, unknown>> {
  return {
    versions: pinned,
    build: 'maven',
    sourceRoots: relative(module, rootsOf(module, 'sourceRoots')),
    kotlinSourceRoots: relative(module, kotlinOnly(module, 'sourceRoots')),
    testSourceRoots: relative(module, rootsOf(module, 'testSourceRoots')),
    kotlinTestSourceRoots: relative(module, kotlinOnly(module, 'testSourceRoots')),
    resourceRoots: relative(module, rootsOf(module, 'resourceRoots')),
    ...fieldsOf(springFacts(classpaths)),
    springClasspath: springClasspath(classpaths),
    guava: hasJar(classpaths.mainCompile, GUAVA_JAR),
    testGuava: hasJar(classpaths.testCompile, GUAVA_JAR),
    testAwaitility: hasJar(classpaths.testCompile, AWAITILITY_JAR),
    published: module['published'],
    runsFailsafe: module['runsFailsafe'],
  };
}

export function writeManifest({ reportDir, manifest, testsFailed }: ManifestWrite): void {
  writeFileSync(
    path.join(reportDir, 'manifest.json'),
    JSON.stringify({ ...manifest, ...(testsFailed ? { testsFailed: true } : {}) }),
  );
}
