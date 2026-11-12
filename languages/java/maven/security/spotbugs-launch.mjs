import { existsSync } from 'node:fs';
import path from 'node:path';
import { GRADLE_DIRECTORY } from '../../builds/java-build.mjs';

const SECURITY_DIRECTORY = path.join(GRADLE_DIRECTORY, 'security');
const SINK_FILES = {
  SqlInjectionDetector: [
    ['jakarta-sinks.txt', 'SQL_INJECTION_JPA'],
    ['spring-jdbc-sinks.txt', 'SQL_INJECTION_SPRING_JDBC'],
  ],
  PathTraversalDetector: [['path-sinks.txt', 'PATH_TRAVERSAL_IN']],
};

export function spotbugsLaunch({ module, report, tools, settings, auxClasspath = [] }) {
  return {
    jvmArgs: Object.entries(SINK_FILES).map(([detector, sinks]) => {
      const value = sinks
        .map(([file, type]) => `${path.join(SECURITY_DIRECTORY, file)}|${type}`)
        .join(path.delimiter);
      return `-Dfindsecbugs.injection.customconfigfile.${detector}=${value}`;
    }),
    args: [
      ...settings,
      '-sarif',
      '-pluginList',
      tools.spotbugsPlugins.join(path.delimiter),
      '-exclude',
      path.join(SECURITY_DIRECTORY, 'exclude.xml'),
      '-output',
      report,
      '-sourcepath',
      module.sourceRoots.filter((root) => existsSync(root)).join(path.delimiter),
      ...(auxClasspath.length === 0
        ? []
        : [
            '-auxclasspath',
            auxClasspath.filter((entry) => existsSync(entry)).join(path.delimiter),
          ]),
      module.outputDirectory,
    ],
  };
}
