import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  detectedPreset,
  scriptProjectPreset,
} from '../../configuration/project-checks/preset-detection.mjs';
import { sourceRoots as defaultSourceRoots } from '../../../languages/typescript/preset/layout.mjs';
import { existingConfig } from '../files/config-file.mjs';
import { describeJvmProject } from './jvm-project.mjs';
import { describeNodeProject } from './node-project.mjs';
import { describePythonProject } from './python-project.mjs';

function emptySourcesNote(roots) {
  return `No TypeScript or JavaScript sources under ${roots.join(', ')} yet, so the TypeScript preset is set. For another layout, set "layout.sourceRoots" in nitpicker.config.json.`;
}

function stringList(value) {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string')
    ? value
    : undefined;
}

function detectionConfig(projectRoot) {
  const existing = existingConfig(projectRoot);
  const config = existing.kind === 'parsed' ? existing.config : {};
  const testRoots = stringList(config.layout?.testRoots);
  const exclude = stringList(config.exclude);
  return {
    layout: {
      sourceRoots: stringList(config.layout?.sourceRoots) ?? defaultSourceRoots,
      ...(testRoots === undefined ? {} : { testRoots }),
    },
    ...(exclude === undefined ? {} : { exclude }),
  };
}

export function detectProject(projectRoot) {
  const config = detectionConfig(projectRoot);
  const sourceRoots = config.layout.sourceRoots;
  const scriptPreset = scriptProjectPreset(config, projectRoot);
  if (scriptPreset !== undefined) {
    return describeNodeProject(projectRoot, scriptPreset);
  }
  const marker = detectedPreset(projectRoot);
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
  return { ...project, notes: [...project.notes, emptySourcesNote(sourceRoots)] };
}
