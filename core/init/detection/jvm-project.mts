import { existsSync } from 'node:fs';
import path from 'node:path';
import { buildRunsPreset, describeJavaBuild } from '../../../languages/java/builds/java-build.mjs';
import type { InitProject } from '../init-types.mts';
import { existingConfig } from '../files/config-file.mts';
import { fieldsOf, textOf } from '../../../shared/values/readers.mts';

export type Detected = {
  readonly preset: string;
  readonly kotlinSources?: unknown;
  readonly javaSources?: unknown;
};

type JvmPreset = { readonly preset: string; readonly notes: readonly string[] };

type JavaBuild = {
  readonly tool: string;
  readonly both: boolean;
  readonly reason?: string;
};

const buildIn: (projectRoot: string) => JavaBuild = describeJavaBuild;
const runsPreset: (buildTool: string, preset: string) => boolean = buildRunsPreset;

const BUILD_LABELS: Readonly<Record<string, string>> = { gradle: 'Gradle', maven: 'Maven' };
const LAUNCHERS: Readonly<Record<string, string>> = { gradle: 'gradlew', maven: 'mvnw' };
const PATH_COMMANDS: Readonly<Record<string, string>> = { gradle: 'gradle', maven: 'mvn' };

function bothBuildsNote({ tool, reason }: JavaBuild, isNew: boolean): string[] {
  const label = textOf(BUILD_LABELS[tool]);
  const chosen = `pom.xml and a Gradle build both exist: using ${label} (${textOf(reason)})`;
  const other = textOf(BUILD_LABELS[tool === 'maven' ? 'gradle' : 'maven']);
  return [
    isNew
      ? `${chosen}, set as "java.buildTool" in nitpicker.config.json. Change it there to use ${other}.`
      : `${chosen}. To choose, set "java.buildTool" ("maven" or "gradle") in nitpicker.config.json.`,
  ];
}

function configuredBuildTool(projectRoot: string): string | undefined {
  const existing = existingConfig(projectRoot);
  const tool =
    existing.kind === 'parsed'
      ? fieldsOf(fieldsOf(existing.config)['java'])['buildTool']
      : undefined;
  return typeof tool === 'string' && tool in BUILD_LABELS ? tool : undefined;
}

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
  const configured = configuredBuildTool(projectRoot);
  const detectedBuild = buildIn(projectRoot);
  const build = configured === undefined ? detectedBuild : { tool: configured, both: false };
  const buildTool = build.tool;
  const isNew = existingConfig(projectRoot).kind === 'missing';
  const { preset, notes } = presetFor(detected, buildTool);
  const languages = preset === 'kotlin' ? 'Kotlin' : 'Java';
  return {
    preset,
    family: 'jvm',
    buildTool,
    ...(build.both && isNew ? { settings: { java: { buildTool } } } : {}),
    javaSources: detected.javaSources === true,
    notes: [
      ...(build.both ? bothBuildsNote(build, isNew) : []),
      ...notes,
      ...buildNotes(projectRoot, buildTool),
    ],
    summary: `${languages}, ${textOf(BUILD_LABELS[buildTool])}`,
  };
}
