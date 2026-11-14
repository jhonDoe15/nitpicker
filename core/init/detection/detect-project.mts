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
  emptySourcesMessage,
  sourcesElsewhere,
} from '../../../languages/typescript/preset/notices/empty-sources.mjs';
import { existingConfig } from '../files/config-file.mts';
import { type Detected, describeJvmProject } from './jvm-project.mts';
import { describeNodeProject } from './node-project.mts';
import { describePythonProject } from './python-project.mts';
import type { InitProject } from '../init-types.mts';
import { fieldOf } from '../../../shared/values/readers.mts';

type DetectionConfig = {
  readonly layout: { readonly sourceRoots: readonly string[]; readonly testRoots?: string[] };
  readonly exclude?: string[];
};

const presetMarker: (projectRoot: string) => Detected | undefined = detectedPreset;
const scriptPresetOf: (config: DetectionConfig, projectRoot: string) => string | undefined =
  scriptProjectPreset;
const shippedRoots: unknown = defaultSourceRoots;

function defaultRoots(): string[] {
  return stringList(shippedRoots) ?? [];
}

const layoutOf: (policy: object) => object = resolveLayoutFor;
const elsewhereOf: (projectRoot: string, layout: object) => string = sourcesElsewhere;
const emptyMessage: (config: object, projectRoot: string, policy: object) => string | undefined =
  emptySourcesMessage;

function emptySourcesNote(projectRoot: string, config: DetectionConfig): string {
  const policy = { layout: config.layout, exclude: config.exclude };
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

function detectionConfig(projectRoot: string): DetectionConfig {
  const existing = existingConfig(projectRoot);
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

export function detectProject(projectRoot: string): InitProject {
  const config = detectionConfig(projectRoot);
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
  if (!existsSync(path.join(projectRoot, 'package.json'))) {
    throw new Error(
      `Nothing to detect in ${projectRoot}: no package.json, pom.xml, build.gradle, pyproject.toml or other project file. Run nitpicker init in the project's directory.`,
    );
  }
  const project = describeNodeProject(projectRoot, 'typescript');
  return { ...project, notes: [...project.notes, emptySourcesNote(projectRoot, config)] };
}
