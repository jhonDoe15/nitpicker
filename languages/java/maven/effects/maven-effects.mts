import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { GRADLE_DIRECTORY } from '../../builds/java-build.mts';
import { runJava } from '../programs/java-command.mts';
import type { JavaEnvironment, JavaSpawn } from '../../adapters/typed/java-values.mts';
import { type ToolClasspaths, resolvedTool } from '../typed/kotlin-types.mts';
import type { Classpaths } from '../typed/maven-values.mts';
import { minimumJava } from '../errorprone/maven-jdk.mts';
import { moduleEffectsOptions as untypedModuleEffectsOptions } from '../../adapters/effects/effects-options.mts';
import { compiledProgram, programSources } from '../programs/helper-programs.mts';

type EffectsModule = { readonly basedir: string; readonly outputDirectory: string };
type EffectsContext = {
  readonly module: EffectsModule;
  readonly reportDir: string;
  readonly tools: ToolClasspaths;
  readonly pinned: { readonly asm: string };
  readonly classpaths: Classpaths;
  readonly projectRoot?: string | undefined;
  readonly options?: readonly string[] | undefined;
  readonly spawn?: JavaSpawn | undefined;
  readonly timeoutMs?: number | undefined;
  readonly environment: JavaEnvironment;
};
type EngineRequest = Pick<
  EffectsContext,
  'module' | 'tools' | 'pinned' | 'spawn' | 'timeoutMs' | 'environment'
> & {
  readonly java: string;
};

const moduleEffectsOptions: (options: readonly string[], moduleDir: string) => string[] =
  untypedModuleEffectsOptions;
const EFFECTS_DIRECTORY = path.join(GRADLE_DIRECTORY, 'effects');
const TOOL = 'The effects engine';
const NAME = 'effects';
const RELEASE = 17;

function insideBuild(
  entry: string,
  { module, projectRoot }: Pick<EffectsContext, 'module' | 'projectRoot'>,
): boolean {
  const root = path.resolve(projectRoot ?? module.basedir);
  const resolved = path.resolve(entry);
  return (
    resolved.startsWith(`${root}${path.sep}`) &&
    resolved !== path.resolve(module.outputDirectory) &&
    (statSync(resolved).isDirectory() || resolved.endsWith('.jar'))
  );
}

function librariesOf(tools: ToolClasspaths): string[] {
  return resolvedTool(tools, 'effects').filter((entry) => existsSync(entry));
}

function inputLines({
  module,
  classpaths,
  options,
  projectRoot,
}: Pick<EffectsContext, 'module' | 'classpaths' | 'projectRoot'> & {
  readonly options: readonly string[];
}): string[] {
  return [
    ...[module.outputDirectory]
      .filter((entry) => existsSync(entry))
      .map((entry) => `main ${entry}`),
    ...classpaths.mainCompile
      .filter((entry) => existsSync(entry))
      .map((entry) => `classpath ${entry}`),
    ...classpaths.mainCompile
      .filter((entry) => existsSync(entry) && insideBuild(entry, { module, projectRoot }))
      .map((entry) => `dependency ${entry}`),
    ...moduleEffectsOptions(options, module.basedir).map((option) => `option ${option}`),
  ];
}

function engineClasses({
  module,
  tools,
  pinned,
  spawn,
  timeoutMs,
  java,
  environment,
}: EngineRequest): string {
  return compiledProgram({
    tool: TOOL,
    name: NAME,
    sources: programSources(EFFECTS_DIRECTORY, { recursive: true }),
    version: pinned.asm,
    root: EFFECTS_DIRECTORY,
    release: RELEASE,
    libraries: librariesOf(tools),
    cwd: module.basedir,
    spawn,
    timeoutMs,
    java,
    environment,
  });
}

export function runEffects(context: EffectsContext): void {
  const { module, reportDir, tools, spawn, timeoutMs, environment } = context;
  const output = path.join(reportDir, `${NAME}.json`);
  rmSync(output, { force: true });
  const { java, problem } = minimumJava({
    tool: TOOL,
    minimum: RELEASE,
    spawn: spawn ?? spawnSync,
    environment,
  });
  if (problem !== undefined) {
    writeFileSync(
      output,
      `${JSON.stringify({ unavailable: `${problem}; its rules did not run` })}\n`,
    );
    return;
  }
  const libraries = librariesOf(tools);
  const classes = engineClasses({ ...context, java });
  const work = mkdtempSync(path.join(tmpdir(), 'nitpicker-effects-'));
  try {
    const input = path.join(work, 'effects-input.txt');
    writeFileSync(
      input,
      inputLines({ ...context, options: context.options ?? [] })
        .map((line) => `${line}\n`)
        .join(''),
    );
    runJava({
      tool: TOOL,
      classpath: [classes, ...libraries],
      java,
      mainClass: 'nitpicker.effects.Effects',
      args: [output, input],
      cwd: module.basedir,
      spawn,
      timeoutMs,
      accept: (result) => result.status === 0,
    });
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}
