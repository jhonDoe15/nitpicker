import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { springFacts } from '../spring/arch-rules-gate.mjs';

const GUAVA_JAR = /^guava-\d.*\.jar$/u;
const AWAITILITY_JAR = /^awaitility-\d.*\.jar$/u;

export function relativeTo(basedir, file) {
  return path.relative(basedir, file).replaceAll('\\', '/');
}

function relativeRoots(module, roots) {
  return roots.map((root) => relativeTo(module.basedir, root));
}

function hasJar(classpath, jar) {
  return classpath.some((entry) => jar.test(path.basename(entry)));
}

export function moduleManifest({ module, classpaths, pinned }) {
  return {
    versions: pinned,
    build: 'maven',
    sourceRoots: relativeRoots(module, module.sourceRoots),
    kotlinSourceRoots: relativeRoots(module, module.kotlinSourceRoots ?? []),
    testSourceRoots: relativeRoots(module, module.testSourceRoots),
    resourceRoots: relativeRoots(module, module.resourceRoots),
    ...springFacts(classpaths),
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
