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

function withFoundRoots(projectRoot: string, config: DetectionConfig): InitProject | undefined {
  const found = foldersOf(projectRoot, layoutOf(policyOf(config)));
  const { folders, topFiles } = found;
  const roots = config.layout.sourceRoots.join(', ');
  if (folders.length > 0) {
    const preset = scriptPresetOf({ ...config, layout: { sourceRoots: folders } }, projectRoot);
    const project = describeNodeProject(projectRoot, preset ?? DEFAULT_PRESET);
    const notes = [...project.notes, rootsNote(folders, found, roots)];
    return { ...project, notes, settings: { layout: { sourceRoots: folders } } };
  }
  if (topFiles.length === 0) {
    return undefined;
  }
  const project = describeNodeProject(projectRoot, DEFAULT_PRESET);
  const note =
    `Its code sits at ${topCode(topFiles)}, and only code in a source root folder is checked: ` +
    `every run reports "empty sources" for it until the code moves into a folder, such as ${roots}, ` +
    'that "layout.sourceRoots" names.';
  return { ...project, notes: [...project.notes, note], emptySources: true };
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
