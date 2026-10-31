import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readPinnedTools } from '../../builds/java-build.mjs';

const EXTRACTOR = fileURLToPath(new URL('./ToolText.java', import.meta.url));
const MAXIMUM_OUTPUT = 64 * 1024 * 1024;

const TOOLS = {
  pmd: {
    version: ({ pmd }) => pmd,
    artifacts: ({ pmd }) => [['net.sourceforge.pmd', 'pmd-java', pmd]],
  },
  spotbugs: {
    version: ({ spotbugs }) => spotbugs,
    artifacts: ({ spotbugs }) => [['com.github.spotbugs', 'spotbugs', spotbugs]],
  },
  checkstyle: {
    version: ({ checkstyle }) => checkstyle,
    artifacts: ({ checkstyle }) => [['com.puppycrawl.tools', 'checkstyle', checkstyle]],
    jarArgument: true,
  },
  detekt: {
    version: ({ detekt }) => detekt,
    artifacts: ({ detekt }) => [['io.gitlab.arturbosch.detekt', 'detekt-cli', detekt, 'all']],
  },
  errorprone: {
    version: ({ errorProne, nullAway }) => `${errorProne} (NullAway ${nullAway})`,
    artifacts: ({ errorProne, nullAway }) => [
      ['com.google.errorprone', 'error_prone_core', errorProne],
      ['com.uber.nullaway', 'nullaway', nullAway],
    ],
    transitive: true,
  },
};

/** The JVM tools whose own rule texts the reference keeps a snapshot of. */
export const TOOL_TEXT_TOOLS = Object.keys(TOOLS);

/** Where the snapshot of a tool's rule texts is kept. */
export function toolTextFile(tool) {
  return new URL(`./${tool}.json`, import.meta.url);
}

/** The committed snapshot of a tool's rule texts: `{ version, rules: { [rule]: fields } }`. */
export function readToolText(tool) {
  return JSON.parse(readFileSync(toolTextFile(tool), 'utf8'));
}

/** The version of the tool that nitpicker.init.gradle pins, as the snapshot records it. */
export function pinnedToolTextVersion(tool) {
  return TOOLS[tool].version(readPinnedTools());
}

function dependencyXml([groupId, artifactId, version, classifier]) {
  return [
    '<dependency>',
    `<groupId>${groupId}</groupId><artifactId>${artifactId}</artifactId><version>${version}</version>`,
    classifier === undefined ? '' : `<classifier>${classifier}</classifier>`,
    '</dependency>',
  ].join('');
}

function pomXml(artifacts) {
  return [
    '<project xmlns="http://maven.apache.org/POM/4.0.0"><modelVersion>4.0.0</modelVersion>',
    '<groupId>local</groupId><artifactId>tool-text</artifactId><version>1</version>',
    `<dependencies>${artifacts.map(dependencyXml).join('')}</dependencies></project>`,
  ].join('');
}

function run(command, commandArguments) {
  const result = spawnSync(command, commandArguments, {
    encoding: 'utf8',
    maxBuffer: MAXIMUM_OUTPUT,
  });
  if (result.status !== 0) {
    throw new Error(`${command} failed: ${result.stderr || result.error?.message}`);
  }
  return result.stdout;
}

function extract(tool, work, { maven, java }) {
  const { artifacts, transitive = false, jarArgument = false } = TOOLS[tool];
  const pinned = readPinnedTools();
  const pom = path.join(work, 'pom.xml');
  const library = path.join(work, 'lib');
  writeFileSync(pom, pomXml(artifacts(pinned)));
  run(maven, [
    '-q',
    '-B',
    '-f',
    pom,
    'dependency:copy-dependencies',
    `-DoutputDirectory=${library}`,
    ...(transitive ? [] : ['-DexcludeTransitive=true']),
  ]);
  const jars = readdirSync(library).map((name) => path.join(library, name));
  const [, artifactId] = artifacts(pinned)[0];
  const main = jars.find((jar) => path.basename(jar).startsWith(`${artifactId}-`));
  return JSON.parse(
    run(java, [
      '-Dstdout.encoding=UTF-8',
      '-cp',
      jars.join(path.delimiter),
      EXTRACTOR,
      tool,
      ...(jarArgument ? [main] : []),
    ]),
  );
}

/** The rule texts of the pinned version of `tool`, read from its jars with Maven and Java. */
export function liveToolText(tool, { maven = 'mvn', java = 'java' } = {}) {
  const work = mkdtempSync(path.join(tmpdir(), 'nitpicker-tool-text-'));
  try {
    return { version: pinnedToolTextVersion(tool), rules: extract(tool, work, { maven, java }) };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}
