import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { GRADLE_DIRECTORY } from '../../builds/java-build.mjs';
import { runJava } from '../maven-command.mjs';
import { minimumJava } from '../errorprone/maven-jdk.mjs';
import { moduleEffectsOptions } from '../../adapters/effects/effects-options.mjs';
import { compiledProgram, programSources } from '../programs/helper-programs.mjs';

const EFFECTS_DIRECTORY = path.join(GRADLE_DIRECTORY, 'effects');
const TOOL = 'The effects engine';
const NAME = 'effects';
const RELEASE = 17;

function insideBuild(entry, { module, projectRoot }) {
  const root = path.resolve(projectRoot ?? module.basedir);
  const resolved = path.resolve(entry);
  return (
    resolved.startsWith(`${root}${path.sep}`) &&
    resolved !== path.resolve(module.outputDirectory) &&
    (statSync(resolved).isDirectory() || resolved.endsWith('.jar'))
  );
}

function inputLines({ module, classpaths, options, projectRoot }) {
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

function engineClasses({ module, tools, pinned, spawn, timeoutMs, java }) {
  return compiledProgram({
    tool: TOOL,
    name: NAME,
    sources: programSources(EFFECTS_DIRECTORY, { recursive: true }),
    version: pinned.asm,
    root: EFFECTS_DIRECTORY,
    release: RELEASE,
    libraries: tools.effects.filter((entry) => existsSync(entry)),
    cwd: module.basedir,
    spawn,
    timeoutMs,
    java,
  });
}

export function runEffects(context) {
  const { module, reportDir, tools, spawn, timeoutMs } = context;
  const output = path.join(reportDir, `${NAME}.json`);
  rmSync(output, { force: true });
  const { java, problem } = minimumJava({
    tool: TOOL,
    minimum: RELEASE,
    spawn: spawn ?? spawnSync,
  });
  if (problem !== undefined) {
    writeFileSync(
      output,
      `${JSON.stringify({ unavailable: `${problem}; its rules did not run` })}\n`,
    );
    return;
  }
  const libraries = tools.effects.filter((entry) => existsSync(entry));
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
