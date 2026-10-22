import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  detectedPreset,
  scriptProjectPreset,
} from '../../configuration/project-checks/preset-detection.mjs';
import { describeJvmProject } from './jvm-project.mjs';
import { describeNodeProject } from './node-project.mjs';
import { describePythonProject } from './python-project.mjs';

const EMPTY_SOURCES_NOTE =
  'No TypeScript or JavaScript sources under src yet, so the TypeScript preset is set. For another layout, set "layout.sourceRoots" in nitpicker.config.json.';

export function detectProject(projectRoot) {
  const scriptPreset = scriptProjectPreset({}, projectRoot);
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
  return { ...project, notes: [...project.notes, EMPTY_SOURCES_NOTE] };
}
