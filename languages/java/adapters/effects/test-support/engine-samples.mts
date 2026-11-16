import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { GRADLE_DIRECTORY, readPinnedTools } from '../../../builds/java-build.mjs';
import { javaCommand, runJava } from '../../../maven/maven-command.mjs';
import { compiledProgram, programSources } from '../../../maven/programs/helper-programs.mjs';
import { callUntyped } from '../../typed/java-values.mts';
import { parseJson } from '../../../../../shared/values/readers.mts';

type CompileOptions = {
  readonly tool: string;
  readonly name: string;
  readonly sources: string[];
  readonly version: string;
  readonly root: string;
  readonly release: number;
  readonly libraries: string[];
  readonly cwd: string;
  readonly timeoutMs: undefined;
};
const gradleDirectory: string = GRADLE_DIRECTORY;
const pinnedAsm: () => { readonly asm: string } = readPinnedTools;
const javaBinary: (name: string) => string = javaCommand;
const sourcesOf: (directory: string, options: { recursive: boolean }) => string[] = programSources;
const compile: (options: CompileOptions) => string = compiledProgram;

const SAMPLES = path.resolve(import.meta.dirname, '../../fixtures/effects-samples');
const ARTIFACTS = ['asm', 'asm-tree', 'asm-analysis'];
const NAME = 'effects';
const TOOL = 'The effects engine';
const PROCESS_TIMEOUT_MS = 120_000;
const MAVEN_ASM = path.join(homedir(), '.m2/repository/org/ow2/asm');
const GRADLE_ASM = path.join(homedir(), '.gradle/caches/modules-2/files-2.1/org.ow2.asm');

function inside(base: string, ...parts: string[]): string {
  const full = path.resolve(base, ...parts);
  if (!full.startsWith(base + path.sep)) {
    throw new Error(`${full} is outside ${base}`);
  }
  return full;
}

function javaFiles(directory: string): string[] {
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.java'))
    .map((entry) => path.join(entry.parentPath, entry.name));
}

function mavenJar(artifact: string, version: string): string {
  return inside(MAVEN_ASM, artifact, version, `${artifact}-${version}.jar`);
}

function gradleJar(artifact: string, version: string): string | undefined {
  const folder = inside(GRADLE_ASM, artifact, version);
  if (!existsSync(folder)) {
    return undefined;
  }
  return readdirSync(folder, { recursive: true, encoding: 'utf8' })
    .map((entry) => path.join(folder, entry))
    .find((entry) => path.basename(entry) === `${artifact}-${version}.jar`);
}

function downloaded(maven: string, artifact: string, version: string): string {
  const result = spawnSync(
    maven,
    ['-q', '-B', 'dependency:get', `-Dartifact=org.ow2.asm:${artifact}:${version}`],
    { encoding: 'utf8', timeout: PROCESS_TIMEOUT_MS },
  );
  if (result.status !== 0) {
    throw new Error(`Could not fetch ASM ${version}: ${result.stderr || result.stdout}`);
  }
  return mavenJar(artifact, version);
}

function asmJars(maven: string, version: string): string[] {
  return ARTIFACTS.map((artifact) => {
    const local = [mavenJar(artifact, version), gradleJar(artifact, version)].find(
      (jar) => jar !== undefined && existsSync(jar),
    );
    return local ?? downloaded(maven, artifact, version);
  });
}

function javac(classpath: string, output: string, files: readonly string[]): string {
  mkdirSync(output, { recursive: true });
  const result = spawnSync(
    javaBinary('javac'),
    ['-g', '-proc:none', '-nowarn', '-cp', classpath, '-d', output, ...files],
    { encoding: 'utf8', timeout: PROCESS_TIMEOUT_MS },
  );
  if (result.status !== 0) {
    throw new Error(`javac failed: ${result.stderr || result.stdout}`);
  }
  return output;
}

export function runEngineOnSamples({ maven = 'mvn' }: { maven?: string } = {}): {
  work: string;
  report: unknown;
} {
  const version = pinnedAsm().asm;
  const libraries = asmJars(maven, version);
  const engineSources = path.join(gradleDirectory, NAME);
  const engine = compile({
    tool: TOOL,
    name: NAME,
    sources: sourcesOf(engineSources, { recursive: true }),
    version,
    root: engineSources,
    release: 17,
    libraries,
    cwd: SAMPLES,
    timeoutMs: undefined,
  });
  const work = mkdtempSync(path.join(tmpdir(), 'nitpicker-effects-samples-'));
  const stubs = javac('', path.join(work, 'stubs'), javaFiles(path.join(SAMPLES, 'stubs')));
  const library = javac(
    stubs,
    path.join(work, 'library'),
    javaFiles(path.join(SAMPLES, 'library')),
  );
  const classes = javac(
    [stubs, library].join(path.delimiter),
    path.join(work, 'classes'),
    javaFiles(path.join(SAMPLES, 'samples')),
  );
  const input = path.join(work, 'input.txt');
  const output = path.join(work, `${NAME}.json`);
  writeFileSync(
    input,
    `main ${classes}\nclasspath ${stubs}\nclasspath ${library}\ndependency ${library}\nresources ${path.join(SAMPLES, 'resources')}\n`,
  );
  callUntyped(runJava, {
    tool: TOOL,
    classpath: [engine, ...libraries],
    mainClass: 'nitpicker.effects.Effects',
    args: [output, input],
    cwd: work,
    accept: (result: { readonly status: unknown }) => result.status === 0,
  });
  return { work, report: parseJson(readFileSync(output, 'utf8')) };
}
