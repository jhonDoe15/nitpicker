import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readPinnedTools } from '../../builds/java-build.mts';
import { TOOL_TIMEOUT_MS } from '../../../../shared/processes/deadlines.mjs';
import type { ToolText, ToolTextRules, ToolTextTool } from '../typed/tool-text-types.mts';

const EXTRACTOR = fileURLToPath(new URL('./ToolText.java', import.meta.url));
const MAXIMUM_OUTPUT = 64 * 1024 * 1024;
const SPOTBUGS = 'spotbugs';
const CHECKSTYLE = 'checkstyle';

type Pins = Record<string, string>;
type Artifact = readonly [
  groupId: string,
  artifactId: string,
  version: string,
  classifier?: string,
];
type ToolSpec = {
  version: (pins: Pins) => string;
  artifacts: (pins: Pins) => Artifact[];
  jarArgument?: Optional<boolean>;
  transitive?: Optional<boolean>;
};
type Optional<Value> = Value | undefined;
type Extractor = { maven: string; java: string };

const parseToolText: (text: string) => ToolText<unknown> = JSON.parse;
const parseExtracted: (text: string) => unknown = JSON.parse;

function pin(pins: Pins, name: string): string {
  return pins[name] ?? '';
}

const TOOLS: Record<string, ToolSpec> = {
  pmd: {
    version: (pins) => pin(pins, 'pmd'),
    artifacts: (pins) => [['net.sourceforge.pmd', 'pmd-java', pin(pins, 'pmd')]],
  },
  spotbugs: {
    version: (pins) => pin(pins, SPOTBUGS),
    artifacts: (pins) => [['com.github.spotbugs', SPOTBUGS, pin(pins, SPOTBUGS)]],
  },
  checkstyle: {
    version: (pins) => pin(pins, CHECKSTYLE),
    artifacts: (pins) => [['com.puppycrawl.tools', CHECKSTYLE, pin(pins, CHECKSTYLE)]],
    jarArgument: true,
  },
  detekt: {
    version: (pins) => pin(pins, 'detekt'),
    artifacts: (pins) => [
      ['io.gitlab.arturbosch.detekt', 'detekt-cli', pin(pins, 'detekt'), 'all'],
    ],
  },
  errorprone: {
    version: (pins) => `${pin(pins, 'errorProne')} (NullAway ${pin(pins, 'nullAway')})`,
    artifacts: (pins) => [
      ['com.google.errorprone', 'error_prone_core', pin(pins, 'errorProne')],
      ['com.uber.nullaway', 'nullaway', pin(pins, 'nullAway')],
    ],
    transitive: true,
  },
};

export const TOOL_TEXT_TOOLS = Object.keys(TOOLS);

export function toolTextFile(tool: string): URL {
  return new URL(`./${tool}.json`, import.meta.url);
}

export function readToolText<Tool extends ToolTextTool>(tool: Tool): ToolText<ToolTextRules[Tool]>;
export function readToolText(tool: string): ToolText<unknown>;
export function readToolText(tool: string): ToolText<unknown> {
  return parseToolText(readFileSync(toolTextFile(tool), 'utf8'));
}

export function pinnedToolTextVersion(tool: string): string {
  return specOf(tool).version(readPinnedTools());
}

function specOf(tool: string): ToolSpec {
  const spec = TOOLS[tool];
  if (spec === undefined) {
    throw new Error(`Unknown tool ${tool}`);
  }
  return spec;
}

function dependencyXml([groupId, artifactId, version, classifier]: Artifact): string {
  return [
    '<dependency>',
    `<groupId>${groupId}</groupId><artifactId>${artifactId}</artifactId><version>${version}</version>`,
    classifier === undefined ? '' : `<classifier>${classifier}</classifier>`,
    '</dependency>',
  ].join('');
}

function pomXml(artifacts: Artifact[]): string {
  return [
    '<project xmlns="http://maven.apache.org/POM/4.0.0"><modelVersion>4.0.0</modelVersion>',
    '<groupId>local</groupId><artifactId>tool-text</artifactId><version>1</version>',
    `<dependencies>${artifacts.map(dependencyXml).join('')}</dependencies></project>`,
  ].join('');
}

function run(command: string, commandArguments: string[]): string {
  const result = spawnSync(command, commandArguments, {
    encoding: 'utf8',
    maxBuffer: MAXIMUM_OUTPUT,
    timeout: TOOL_TIMEOUT_MS,
  });
  if (result.status !== 0) {
    throw new Error(`${command} failed: ${result.stderr || (result.error?.message ?? '')}`);
  }
  return result.stdout;
}

function extract(tool: string, work: string, { maven, java }: Extractor): unknown {
  const { artifacts, transitive = false, jarArgument = false } = specOf(tool);
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
  const [, artifactId] = artifacts(pinned)[0] ?? [];
  const main = jars.find((jar) => path.basename(jar).startsWith(`${artifactId ?? ''}-`));
  return parseExtracted(
    run(java, [
      '-Dstdout.encoding=UTF-8',
      '-cp',
      jars.join(path.delimiter),
      EXTRACTOR,
      tool,
      ...(jarArgument && main !== undefined ? [main] : []),
    ]),
  );
}

export function liveToolText(
  tool: string,
  { maven = 'mvn', java = 'java' }: Partial<Extractor> = {},
): { version: string; rules: unknown } {
  const work = mkdtempSync(path.join(tmpdir(), 'nitpicker-tool-text-'));
  try {
    return { version: pinnedToolTextVersion(tool), rules: extract(tool, work, { maven, java }) };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}
