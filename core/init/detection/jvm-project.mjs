import { existsSync } from 'node:fs';
import path from 'node:path';
import { buildRunsPreset, detectJavaBuild } from '../../../languages/java/builds/java-build.mjs';

const BUILD_LABELS = { gradle: 'Gradle', maven: 'Maven' };
const LAUNCHERS = { gradle: 'gradlew', maven: 'mvnw' };
const PATH_COMMANDS = { gradle: 'gradle', maven: 'mvn' };

function buildNotes(projectRoot, buildTool) {
  const launcher = LAUNCHERS[buildTool];
  return existsSync(path.join(projectRoot, launcher))
    ? []
    : [
        `There is no ${launcher}, so nitpicker runs ${PATH_COMMANDS[buildTool]} from the PATH. Install it, or add the wrapper.`,
      ];
}

const UNSEEN_KOTLIN_PLUGIN =
  'This Gradle project has Kotlin sources, but none of its build scripts applies the Kotlin plugin, so the java preset is set. It checks the Java sources only; set "preset": "kotlin" to check both.';

function presetFor(detected, buildTool) {
  if (
    detected.kotlinSources !== true ||
    (detected.preset === 'kotlin' && buildRunsPreset(buildTool, 'kotlin'))
  ) {
    return { preset: detected.preset, notes: [] };
  }
  if (buildRunsPreset(buildTool, 'kotlin')) {
    return { preset: 'java', notes: [UNSEEN_KOTLIN_PLUGIN] };
  }
  const label = BUILD_LABELS[buildTool];
  if (!detected.javaSources) {
    throw new Error(
      `This ${label} project has Kotlin sources and no Java ones, and the kotlin preset needs a Gradle build today, so nitpicker cannot check it yet. Build it with Gradle to use the kotlin preset.`,
    );
  }
  return {
    preset: 'java',
    notes: [
      `This ${label} project has Kotlin sources, but the kotlin preset needs a Gradle build today, so the java preset is set. It checks the Java sources only.`,
    ],
  };
}

export function describeJvmProject(projectRoot, detected) {
  const buildTool = detectJavaBuild(projectRoot);
  const { preset, notes } = presetFor(detected, buildTool);
  const languages = preset === 'kotlin' ? 'Kotlin' : 'Java';
  return {
    preset,
    family: 'jvm',
    buildTool,
    javaSources: detected.javaSources === true,
    notes: [...notes, ...buildNotes(projectRoot, buildTool)],
    summary: `${languages}, ${BUILD_LABELS[buildTool]}`,
  };
}
