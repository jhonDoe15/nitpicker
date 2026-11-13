import { existsSync } from 'node:fs';
import path from 'node:path';
import { buildRunsPreset, detectJavaBuild } from '../../../languages/java/builds/java-build.mjs';
import type { InitProject } from '../init-types.mts';
import { textOf } from '../../../shared/values/readers.mts';

export type Detected = {
  readonly preset: string;
  readonly kotlinSources?: unknown;
  readonly javaSources?: unknown;
};

type JvmPreset = { readonly preset: string; readonly notes: readonly string[] };

const buildIn: (projectRoot: string) => string = detectJavaBuild;
const runsPreset: (buildTool: string, preset: string) => boolean = buildRunsPreset;

const BUILD_LABELS: Readonly<Record<string, string>> = { gradle: 'Gradle', maven: 'Maven' };
const LAUNCHERS: Readonly<Record<string, string>> = { gradle: 'gradlew', maven: 'mvnw' };
const PATH_COMMANDS: Readonly<Record<string, string>> = { gradle: 'gradle', maven: 'mvn' };

function buildNotes(projectRoot: string, buildTool: string): string[] {
  const launcher = textOf(LAUNCHERS[buildTool]);
  return existsSync(path.join(projectRoot, launcher))
    ? []
    : [
        `There is no ${launcher}, so nitpicker runs ${textOf(PATH_COMMANDS[buildTool])} from the PATH. Install it, or add the wrapper.`,
      ];
}

const UNSEEN_KOTLIN_PLUGIN =
  'This Gradle project has Kotlin sources, but none of its build scripts applies the Kotlin plugin, so the java preset is set. It checks the Java sources only; set "preset": "kotlin" to check both.';

function presetFor(detected: Detected, buildTool: string): JvmPreset {
  if (
    detected.kotlinSources !== true ||
    (detected.preset === 'kotlin' && runsPreset(buildTool, 'kotlin'))
  ) {
    return { preset: detected.preset, notes: [] };
  }
  if (runsPreset(buildTool, 'kotlin')) {
    return { preset: 'java', notes: [UNSEEN_KOTLIN_PLUGIN] };
  }
  const label = textOf(BUILD_LABELS[buildTool]);
  if (detected.javaSources !== true) {
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

export function describeJvmProject(projectRoot: string, detected: Detected): InitProject {
  const buildTool = buildIn(projectRoot);
  const { preset, notes } = presetFor(detected, buildTool);
  const languages = preset === 'kotlin' ? 'Kotlin' : 'Java';
  return {
    preset,
    family: 'jvm',
    buildTool,
    javaSources: detected.javaSources === true,
    notes: [...notes, ...buildNotes(projectRoot, buildTool)],
    summary: `${languages}, ${textOf(BUILD_LABELS[buildTool])}`,
  };
}
