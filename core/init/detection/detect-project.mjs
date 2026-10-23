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

function configuredSourceRoots(projectRoot) {
  const existing = existingConfig(projectRoot);
  const roots = existing.kind === 'parsed' ? existing.config.layout?.sourceRoots : undefined;
  const valid = Array.isArray(roots) && roots.every((root) => typeof root === 'string');
  return valid ? roots : defaultSourceRoots;
}

export function detectProject(projectRoot) {
  const sourceRoots = configuredSourceRoots(projectRoot);
  const scriptPreset = scriptProjectPreset({ layout: { sourceRoots } }, projectRoot);
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
