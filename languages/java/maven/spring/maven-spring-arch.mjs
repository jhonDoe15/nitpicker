import { spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { GRADLE_DIRECTORY } from '../../builds/java-build.mjs';
import { runJava } from '../maven-command.mjs';
import { compiledProgram, programSources } from '../programs/helper-programs.mjs';

const RULES_DIRECTORY = path.join(GRADLE_DIRECTORY, 'archunit');
const TOOL = 'Spring architecture rules';

function existing(entries) {
  return entries.filter((entry) => existsSync(entry));
}

function runRules({ module, classpaths, libraries, locations, spawn }) {
  const { classes, output } = locations;
  const projectPath = [
    module.outputDirectory,
    module.testOutputDirectory,
    ...classpaths.mainCompile,
    ...classpaths.testCompile,
  ];
  runJava({
    tool: TOOL,
    classpath: [...new Set([classes, ...libraries, ...existing(projectPath)])],
    mainClass: 'ArchRules',
    args: [output, module.outputDirectory, module.testOutputDirectory],
    cwd: module.basedir,
    spawn,
    accept: (result) => result.status === 0,
  });
}

export function runSpringArch(options) {
  const { module, reportDir, tools, classpaths, pinned, spring, spawn = spawnSync } = options;
  if (!spring) {
    return;
  }
  const output = path.join(reportDir, 'spring-arch.json');
  rmSync(output, { force: true });
  const libraries = existing(tools.archunit);
  const classes = compiledProgram({
    tool: TOOL,
    name: 'spring-arch',
    sources: programSources(options.rules ?? RULES_DIRECTORY),
    version: pinned.archunit,
    libraries,
    cwd: module.basedir,
    spawn,
  });
  runRules({ module, classpaths, libraries, locations: { classes, output }, spawn });
}
