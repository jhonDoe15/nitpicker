import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { javaCommand, runJava } from '../../maven-command.mts';
import { GRADLE_DIRECTORY } from '../../../builds/java-build.mts';
import { kotlinFiles, lintedRoots } from './kotlin-files.mts';
import { relativeRoots } from '../../module/module-paths.mts';
import { type JavaSpawn, callUntyped } from '../../../adapters/typed/java-values.mts';
import { succeeded } from '../../../adapters/design/producer/design-program.mts';
import { textOf } from '../../../../../shared/values/readers.mts';
import type { KotlinPinned } from './kotlin-dependencies.mts';
import type { KotlinModule, ToolClasspaths } from '../../typed/kotlin-types.mts';

const PSI_DIRECTORY = path.join(GRADLE_DIRECTORY, 'kotlin-psi');
const PSI_MAIN_CLASS = 'nitpicker.kotlinpsi.KotlinPsi';
const COMPILED_MARKER = '.compiled';
const TEST_PREFIX = 'test:';
const EMPTY_METRICS = '{"functions":[],"files":[]}';
const EMPTY_FILES = '{"files":[]}';

export function psiArguments({
  metrics,
  facts,
  module,
}: {
  readonly metrics: string;
  readonly facts: string;
  readonly module: Pick<KotlinModule, 'basedir' | 'kotlin'>;
}): string[] {
  return [
    metrics,
    facts,
    module.basedir,
    ...relativeRoots(module, module.kotlin.sourceRoots),
    ...relativeRoots(module, module.kotlin.testSourceRoots).map((root) => `${TEST_PREFIX}${root}`),
  ];
}

function psiSources(): string[] {
  return readdirSync(PSI_DIRECTORY, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.java'))
    .map((entry) => path.join(entry.parentPath, entry.name))
    .sort();
}

function compilerOptions(pinned: Pick<KotlinPinned, 'kotlinCompiler'>): string[] {
  return ['-Djava.awt.headless=true', `-Dnitpicker.kotlinCompiler=${pinned.kotlinCompiler}`];
}

type PsiRun = {
  readonly classes: string;
  readonly tools: ToolClasspaths;
  readonly spawn: JavaSpawn | undefined;
  readonly timeoutMs: unknown;
};

function compilePsi({ classes, tools, spawn, timeoutMs }: PsiRun): void {
  const marker = path.join(classes, COMPILED_MARKER);
  if (!existsSync(marker)) {
    mkdirSync(classes, { recursive: true });
    callUntyped(runJava, {
      java: textOf(callUntyped(javaCommand, 'javac')),
      tool: 'javac',
      classpath: tools['kotlin-compiler'],
      args: ['-proc:none', '-d', classes, ...psiSources()],
      cwd: classes,
      accept: succeeded,
      spawn,
      timeoutMs,
    });
    writeFileSync(marker, '');
  }
}

export function runKotlinPsi({
  module,
  reportDir,
  tools,
  pinned,
  classes,
  spawn,
  timeoutMs,
}: PsiRun & {
  readonly module: KotlinModule;
  readonly reportDir: string;
  readonly pinned: KotlinPinned;
}): void {
  const metrics = path.join(reportDir, 'kotlin-metrics.json');
  const facts = path.join(reportDir, 'kotlin-facts.json');
  if (kotlinFiles(lintedRoots(module.kotlin)).length === 0) {
    writeFileSync(metrics, EMPTY_METRICS);
    writeFileSync(facts, EMPTY_FILES);
    return;
  }
  compilePsi({ classes, tools, spawn, timeoutMs });
  callUntyped(runJava, {
    tool: 'KotlinPsi',
    classpath: [...(tools['kotlin-compiler'] ?? []), classes],
    mainClass: PSI_MAIN_CLASS,
    jvmArgs: compilerOptions(pinned),
    args: psiArguments({ metrics, facts, module }),
    cwd: module.basedir,
    accept: succeeded,
    spawn,
    timeoutMs,
  });
}
