import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  detectedPreset,
  scriptProjectPreset,
} from '../../configuration/project-checks/preset-detection.mjs';
import {
  sourceRoots as defaultSourceRoots,
  resolveLayoutFor,
} from '../../../languages/typescript/preset/layout.mjs';
import {
  type CodeFolders,
  codeFolders,
  emptySourcesMessage,
  sourcesElsewhere,
} from '../../../languages/typescript/preset/notices/empty-sources.mts';
import { type ExistingConfig, existingConfig } from '../files/config-file.mts';
import { type Detected, describeJvmProject } from './jvm-project.mts';
import { describeNodeProject } from './node-project.mts';
import { PROJECT_ROOT, isRootLevelPackage } from './root-level/root-level-package.mts';
import { describePythonProject } from './python-project.mts';
import type { InitProject } from '../init-types.mts';
import type { Layout } from '../../../languages/typescript/adapters/typed/head-policy.mts';
import { fieldOf } from '../../../shared/values/readers.mts';

type DetectionConfig = {
  readonly layout: { readonly sourceRoots: readonly string[]; readonly testRoots?: string[] };
  readonly exclude?: string[];
};

const presetMarker: (projectRoot: string) => Detected | undefined = detectedPreset;
const scriptPresetOf: (config: DetectionConfig, projectRoot: string) => string | undefined =
  scriptProjectPreset;
const shippedRoots: unknown = defaultSourceRoots;
const DEFAULT_PRESET = 'typescript';

function defaultRoots(): string[] {
  return stringList(shippedRoots) ?? [];
}

const layoutOf: (policy: object) => Layout = resolveLayoutFor;
const elsewhereOf: (projectRoot: string, layout: Layout) => string = sourcesElsewhere;
const foldersOf: (projectRoot: string, layout: Layout) => CodeFolders = codeFolders;
const emptyMessage: (config: object, projectRoot: string, policy: object) => string | undefined =
  emptySourcesMessage;

function policyOf(config: DetectionConfig): object {
  return { layout: config.layout, exclude: config.exclude };
}

function emptySourcesNote(projectRoot: string, config: DetectionConfig): string {
  const policy = policyOf(config);
  const message = emptyMessage({}, projectRoot, policy);
  if (message !== undefined && elsewhereOf(projectRoot, layoutOf(policy)) !== '') {
    return message;
  }
  const roots = config.layout.sourceRoots;
  if (foldersOf(projectRoot, layoutOf(policy)).topFiles.length > 0) {
    return `No TypeScript or JavaScript sources under ${roots.join(', ')}, but there is code at the project root. Set "layout.sourceRoots" to ["."] in nitpicker.config.json to check it.`;
  }
  return `No TypeScript or JavaScript sources under ${roots.join(', ')} yet, so the TypeScript preset is set. For another layout, set "layout.sourceRoots" in nitpicker.config.json.`;
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function stringList(value: unknown): string[] | undefined {
  return isStringList(value) ? value : undefined;
}

function detectionConfig(existing: ExistingConfig): DetectionConfig {
  const config = existing.kind === 'parsed' ? existing.config : {};
  const testRoots = stringList(fieldOf(config['layout'], 'testRoots'));
  const exclude = stringList(config['exclude']);
  return {
    layout: {
      sourceRoots: stringList(fieldOf(config['layout'], 'sourceRoots')) ?? defaultRoots(),
      ...(testRoots === undefined ? {} : { testRoots }),
    },
    ...(exclude === undefined ? {} : { exclude }),
  };
}

function topCode(files: readonly string[]): string {
  const count = String(files.length);
  return `the folder top (${count} ${files.length === 1 ? 'file' : 'files'})`;
}

function rootsNote(folders: readonly string[], { topFiles }: CodeFolders, roots: string): string {
  const setting = `"layout.sourceRoots" to ${JSON.stringify(folders)}`;
  const top =
    topFiles.length === 0 ? '' : ` The code at ${topCode(topFiles)} stays out of the checks.`;
  return `Its code is under ${folders.join(', ')}, not ${roots}, so init sets ${setting}.${top}`;
}

function rootLevelProject(projectRoot: string, found: CodeFolders): InitProject | undefined {
  if (!isRootLevelPackage(projectRoot, found)) {
    return undefined;
  }
  const settings = { layout: { sourceRoots: [PROJECT_ROOT] } };
  const preset = scriptPresetOf(settings, projectRoot) ?? DEFAULT_PRESET;
  const project = describeNodeProject(projectRoot, preset);
  const note =
    `Its code is at the project root, so init sets "layout.sourceRoots" to ${JSON.stringify(settings.layout.sourceRoots)}. ` +
    'node_modules, tests, build output and tool config files stay out of the checks.';
  return { ...project, notes: [...project.notes, note], settings };
}

function withFoundRoots(projectRoot: string, config: DetectionConfig): InitProject | undefined {
  const found = foldersOf(projectRoot, layoutOf(policyOf(config)));
  const rootLevel = rootLevelProject(projectRoot, found);
  if (rootLevel !== undefined) {
    return rootLevel;
  }
  const { folders } = found;
  const roots = config.layout.sourceRoots.join(', ');
  if (folders.length > 0) {
    const preset = scriptPresetOf({ ...config, layout: { sourceRoots: folders } }, projectRoot);
    const project = describeNodeProject(projectRoot, preset ?? DEFAULT_PRESET);
    const notes = [...project.notes, rootsNote(folders, found, roots)];
    return { ...project, notes, settings: { layout: { sourceRoots: folders } } };
  }
  return undefined;
}

const SCRIPT_PRESETS = new Set(['typescript', 'javascript']);
const JVM_PRESETS = new Set(['java', 'kotlin']);

export function detectProjectAs(projectRoot: string, preset: string): InitProject {
  const marker = presetMarker(projectRoot);
  if (SCRIPT_PRESETS.has(preset)) {
    return describeNodeProject(projectRoot, preset);
  }
  const bothJvm = JVM_PRESETS.has(preset) && JVM_PRESETS.has(marker?.preset ?? '');
  if (marker === undefined || (marker.preset !== preset && !bothJvm)) {
    return detectProject(projectRoot);
  }
  return preset === 'python'
    ? describePythonProject(projectRoot)
    : describeJvmProject(projectRoot, { ...marker, preset });
}

export function detectProject(projectRoot: string): InitProject {
  const existing = existingConfig(projectRoot);
  const config = detectionConfig(existing);
  const scriptPreset = scriptPresetOf(config, projectRoot);
  if (scriptPreset !== undefined) {
    return describeNodeProject(projectRoot, scriptPreset);
  }
  const marker = presetMarker(projectRoot);
  if (marker?.preset === 'python') {
    return describePythonProject(projectRoot);
  }
  if (marker !== undefined) {
    return describeJvmProject(projectRoot, marker);
  }
  return packageWithoutSources(projectRoot, existing, config);
}

function packageWithoutSources(
  projectRoot: string,
  existing: ExistingConfig,
  config: DetectionConfig,
): InitProject {
  if (!existsSync(path.join(projectRoot, 'package.json'))) {
    throw new Error(
      `Nothing to detect in ${projectRoot}: no package.json, pom.xml, build.gradle, pyproject.toml or other project file. Run nitpicker init in the project's directory.`,
    );
  }
  const found = existing.kind === 'missing' ? withFoundRoots(projectRoot, config) : undefined;
  if (found !== undefined) {
    return found;
  }
  const project = describeNodeProject(projectRoot, DEFAULT_PRESET);
  return { ...project, notes: [...project.notes, emptySourcesNote(projectRoot, config)] };
}
