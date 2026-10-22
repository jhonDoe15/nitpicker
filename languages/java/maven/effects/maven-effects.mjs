import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { GRADLE_DIRECTORY } from '../../builds/java-build.mjs';
import { runJava } from '../maven-command.mjs';
import { compiledProgram, programSources } from '../programs/helper-programs.mjs';

const EFFECTS_DIRECTORY = path.join(GRADLE_DIRECTORY, 'effects');
const TOOL = 'The effects engine';
const NAME = 'effects';
const ASM_ARTIFACTS = ['asm', 'asm-tree', 'asm-analysis'];

export function effectsTool(pinned) {
  return [
    {
      name: NAME,
      coordinates: ASM_ARTIFACTS.map((artifact) => `org.ow2.asm:${artifact}:${pinned.asm}`),
    },
  ];
}

function inputLines({ module, classpaths, options }) {
  return [
    ...[module.outputDirectory]
      .filter((entry) => existsSync(entry))
      .map((entry) => `main ${entry}`),
    ...classpaths.mainCompile
      .filter((entry) => existsSync(entry))
      .map((entry) => `classpath ${entry}`),
    ...options.map((option) => `option ${option}`),
  ];
}

export function runEffects({ module, reportDir, tools, classpaths, pinned, options = [] }) {
  const output = path.join(reportDir, `${NAME}.json`);
  rmSync(output, { force: true });
  const libraries = tools.effects.filter((entry) => existsSync(entry));
  const classes = compiledProgram({
    tool: TOOL,
    name: NAME,
    sources: programSources(EFFECTS_DIRECTORY, { recursive: true }),
    version: pinned.asm,
    root: EFFECTS_DIRECTORY,
    libraries,
    cwd: module.basedir,
  });
  const work = mkdtempSync(path.join(tmpdir(), 'nitpicker-effects-'));
  try {
    const input = path.join(work, 'effects-input.txt');
    writeFileSync(
      input,
      inputLines({ module, classpaths, options })
        .map((line) => `${line}\n`)
        .join(''),
    );
    runJava({
      tool: TOOL,
      classpath: [classes, ...libraries],
      mainClass: 'nitpicker.effects.Effects',
      args: [output, input],
      cwd: module.basedir,
      accept: (result) => result.status === 0,
    });
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}
