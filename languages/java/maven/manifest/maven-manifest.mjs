import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { springFacts } from '../spring/arch-rules-gate.mjs';
import { relativeRoots } from '../module/module-paths.mjs';

const GUAVA_JAR = /^guava-\d.*\.jar$/u;
const AWAITILITY_JAR = /^awaitility-\d.*\.jar$/u;

function hasJar(classpath, jar) {
  return classpath.some((entry) => jar.test(path.basename(entry)));
}

function kotlinOnlyRoots(module) {
  return (module.kotlin?.sourceRoots ?? []).filter((root) => !module.sourceRoots.includes(root));
}

function kotlinOnlyTestRoots(module) {
  return (module.kotlin?.testSourceRoots ?? []).filter(
    (root) => !module.testSourceRoots.includes(root),
  );
}

function springClasspath({ testRuntime = [], mainCompile, testCompile = [] }) {
  return [...new Set([...testRuntime, ...mainCompile, ...testCompile])];
}

export function moduleManifest({ module, classpaths, pinned }) {
  const spring = springFacts(classpaths);
  return {
    versions: pinned,
    build: 'maven',
    sourceRoots: relativeRoots(module, module.sourceRoots),
    kotlinSourceRoots: relativeRoots(module, kotlinOnlyRoots(module)),
    testSourceRoots: relativeRoots(module, module.testSourceRoots),
    kotlinTestSourceRoots: relativeRoots(module, kotlinOnlyTestRoots(module)),
    resourceRoots: relativeRoots(module, module.resourceRoots),
    ...spring,
    springClasspath: springClasspath(classpaths),
    guava: hasJar(classpaths.mainCompile, GUAVA_JAR),
    testGuava: hasJar(classpaths.testCompile, GUAVA_JAR),
    testAwaitility: hasJar(classpaths.testCompile, AWAITILITY_JAR),
    published: module.published,
    runsFailsafe: module.runsFailsafe,
  };
}

export function writeManifest({ reportDir, manifest, testsFailed }) {
  writeFileSync(
    path.join(reportDir, 'manifest.json'),
    JSON.stringify({ ...manifest, ...(testsFailed ? { testsFailed: true } : {}) }),
  );
}
