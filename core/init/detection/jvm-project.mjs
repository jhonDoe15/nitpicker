import { existsSync } from 'node:fs';
import path from 'node:path';
import { detectJavaBuild } from '../../../languages/java/builds/java-build.mjs';

const KOTLIN_BUILDS = ['gradle'];
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

function presetFor(detected, buildTool) {
  if (detected.preset === 'kotlin' && !KOTLIN_BUILDS.includes(buildTool)) {
    return {
      preset: 'java',
      notes: [
        'This Maven project has more Kotlin than Java sources, but the kotlin preset needs a Gradle build, so the java preset is set. It checks the Java sources.',
      ],
    };
  }
  return { preset: detected.preset, notes: [] };
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
