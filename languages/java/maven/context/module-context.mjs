import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { COMPILE_CLASSPATH, TEST_CLASSPATH } from '../maven-build.mjs';

const SPRING_JAR = /^spring-(?:context|boot)-.*\.jar$/u;

function readClasspath(module, file) {
  const location = path.join(module.basedir, file);
  if (!existsSync(location)) {
    throw new Error(`Maven wrote no classpath for module ${module.artifactId}: ${location}`);
  }
  return readFileSync(location, 'utf8')
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function moduleContext(shared, module) {
  const compile = readClasspath(module, COMPILE_CLASSPATH);
  const { projectRoot, reportBase } = shared;
  return {
    ...shared,
    module,
    reportRoot: path.join(reportBase, module.key),
    classpaths: { compile, test: readClasspath(module, TEST_CLASSPATH) },
    spring: compile.some((entry) => SPRING_JAR.test(path.basename(entry))),
    relative: (file) => path.relative(projectRoot, file).split(path.sep).join('/'),
  };
}
