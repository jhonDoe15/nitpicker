import { existsSync } from 'node:fs';
import { configError } from '../../../../shared/config.mjs';
import { pathInside } from '../../../../shared/filesystem.mjs';
import { validateJvmSection } from '../../adapters/settings/jvm-section.mjs';
import { GRADLE_BUILD_FILES, JAVA_BUILD_TOOLS } from '../java-build.mjs';

export const JAVA_KEYS = ['buildTool'];

const BUILD_FILES = { maven: ['pom.xml'], gradle: GRADLE_BUILD_FILES };

export function validateJavaBuildSetting(config) {
  const java = validateJvmSection(config, 'java', JAVA_KEYS);
  if (java?.buildTool !== undefined && !JAVA_BUILD_TOOLS.includes(java.buildTool)) {
    throw configError(`"java.buildTool" must be one of: ${JAVA_BUILD_TOOLS.join(', ')}`);
  }
}

export function rejectMissingConfiguredBuild(config, projectRoot) {
  const tool = config.java?.buildTool;
  if (
    tool === undefined ||
    BUILD_FILES[tool].some((name) => existsSync(pathInside(projectRoot, name) ?? ''))
  ) {
    return;
  }
  const other = JAVA_BUILD_TOOLS.find((name) => name !== tool);
  throw configError(
    `"java.buildTool" is "${tool}", but ${projectRoot} has no ${BUILD_FILES[tool].join(' or ')}. ` +
      `Run nitpicker from the project's folder, or set "java.buildTool" to "${other}" or remove it.`,
  );
}
