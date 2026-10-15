import { createHash } from 'node:crypto';

export const DEPENDENCY_PLUGIN = 'org.apache.maven.plugins:maven-dependency-plugin:3.8.1';
export const HELP_PLUGIN = 'org.apache.maven.plugins:maven-help-plugin:3.5.1';
export const CLASSPATH_DIRECTORY = 'classpaths';
export const CHECKSTYLE_CONFIG_DIRECTORY = 'checkstyle-config';

const JUNIT_PLATFORM_EXCLUSIONS = [
  'org.junit.platform:*',
  'org.junit.jupiter:*',
  'org.opentest4j:*',
  'org.apiguardian:*',
];

export const TOOL_DEPENDENCIES = {
  pmd: [
    { coordinates: 'net.sourceforge.pmd:pmd-cli', version: 'pmd' },
    { coordinates: 'net.sourceforge.pmd:pmd-java', version: 'pmd' },
  ],
  spotbugs: [{ coordinates: 'com.github.spotbugs:spotbugs', version: 'spotbugs' }],
  format: [
    { coordinates: 'com.google.googlejavaformat:google-java-format', version: 'googleJavaFormat' },
  ],
  checkstyle: [{ coordinates: 'com.puppycrawl.tools:checkstyle', version: 'checkstyle' }],
  'jacoco-cli': [
    { coordinates: 'org.jacoco:org.jacoco.cli', version: 'jacoco', classifier: 'nodeps' },
  ],
  'jacoco-agent': [
    { coordinates: 'org.jacoco:org.jacoco.agent', version: 'jacoco', classifier: 'runtime' },
  ],
  pit: [{ coordinates: 'org.pitest:pitest-command-line', version: 'pitest' }],
  'pit-junit5': [
    {
      coordinates: 'org.pitest:pitest-junit5-plugin',
      version: 'pitestJunit5',
      exclusions: JUNIT_PLATFORM_EXCLUSIONS,
    },
  ],
};

const UNPACKED = {
  checkstyle: { artifactId: 'checkstyle', include: 'google_checks.xml' },
};

function dependencyXml({ coordinates, version, classifier, exclusions = [] }, versions) {
  const [groupId, artifactId] = coordinates.split(':');
  const resolved = versions[version] ?? version;
  const lines = [
    `<groupId>${groupId}</groupId>`,
    `<artifactId>${artifactId}</artifactId>`,
    `<version>${resolved}</version>`,
    ...(classifier === undefined ? [] : [`<classifier>${classifier}</classifier>`]),
    ...(exclusions.length === 0
      ? []
      : [
          `<exclusions>${exclusions
            .map((entry) => {
              const [excludedGroup, excludedArtifact] = entry.split(':');
              return `<exclusion><groupId>${excludedGroup}</groupId><artifactId>${excludedArtifact}</artifactId></exclusion>`;
            })
            .join('')}</exclusions>`,
        ]),
  ];
  return `<dependency>${lines.join('')}</dependency>`;
}

function unpackXml({ artifactId, include }) {
  return (
    '<execution><id>unpack</id><phase>validate</phase><goals><goal>unpack-dependencies</goal></goals>' +
    `<configuration><includeArtifactIds>${artifactId}</includeArtifactIds>` +
    `<includes>${include}</includes>` +
    `<outputDirectory>\${nitpicker.out}/${CHECKSTYLE_CONFIG_DIRECTORY}</outputDirectory></configuration></execution>`
  );
}

function toolPom(name, dependencies, versions) {
  const unpack = UNPACKED[name];
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<project xmlns="http://maven.apache.org/POM/4.0.0">',
    '<modelVersion>4.0.0</modelVersion>',
    '<parent><groupId>nitpicker.tools</groupId><artifactId>tools</artifactId><version>1</version></parent>',
    `<artifactId>${name}</artifactId>`,
    `<dependencies>${dependencies.map((entry) => dependencyXml(entry, versions)).join('')}</dependencies>`,
    unpack === undefined
      ? ''
      : `<build><plugins><plugin><artifactId>maven-dependency-plugin</artifactId><executions>${unpackXml(unpack)}</executions></plugin></plugins></build>`,
    '</project>',
    '',
  ].join('\n');
}

function parentPom(names) {
  const [groupId, artifactId, version] = DEPENDENCY_PLUGIN.split(':');
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<project xmlns="http://maven.apache.org/POM/4.0.0">',
    '<modelVersion>4.0.0</modelVersion>',
    '<groupId>nitpicker.tools</groupId><artifactId>tools</artifactId><version>1</version>',
    '<packaging>pom</packaging>',
    `<modules>${names.map((name) => `<module>${name}</module>`).join('')}</modules>`,
    `<build><plugins><plugin><groupId>${groupId}</groupId><artifactId>${artifactId}</artifactId><version>${version}</version>`,
    '<executions><execution><id>classpath</id><phase>validate</phase><goals><goal>build-classpath</goal></goals>',
    `<configuration><outputFile>\${nitpicker.out}/${CLASSPATH_DIRECTORY}/\${project.artifactId}.txt</outputFile></configuration>`,
    '</execution></executions></plugin></plugins></build>',
    '</project>',
    '',
  ].join('\n');
}

export function toolFiles(dependencies, versions) {
  const names = Object.keys(dependencies).sort();
  return new Map([
    ['pom.xml', parentPom(names)],
    ...names.map((name) => [`${name}/pom.xml`, toolPom(name, dependencies[name], versions)]),
  ]);
}

export function toolSetKey(files) {
  const hash = createHash('sha256');
  for (const [name, text] of [...files].sort(([left], [right]) => left.localeCompare(right))) {
    hash.update(`${name}\0${text}\0`);
  }
  return hash.digest('hex').slice(0, 24);
}

export function launcherDependencies(version) {
  return {
    [`junit-launcher`]: [{ coordinates: 'org.junit.platform:junit-platform-launcher', version }],
  };
}
