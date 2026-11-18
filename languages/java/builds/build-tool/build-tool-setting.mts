import { existsSync } from 'node:fs';
import { configError } from '../../../../shared/config.mjs';
import { pathInside } from '../../../../shared/filesystem.mjs';
import { validateJvmSection } from '../../adapters/settings/jvm-section.mts';
import { GRADLE_BUILD_FILES, JAVA_BUILD_TOOLS } from '../java-build.mts';
import { callUntyped } from '../../adapters/typed/java-values.mts';
import { fieldOf, optionalText } from '../../../../shared/values/readers.mts';

const BUILD_TOOL = 'buildTool';

export const JAVA_KEYS = [BUILD_TOOL];

const BUILD_FILES: Readonly<Record<string, readonly string[]>> = {
  maven: ['pom.xml'],
  gradle: GRADLE_BUILD_FILES,
};

export function validateJavaBuildSetting(config: unknown): void {
  const java: unknown = callUntyped(validateJvmSection, config, 'java', JAVA_KEYS);
  const buildTool = fieldOf(java, BUILD_TOOL);
  if (buildTool !== undefined && !JAVA_BUILD_TOOLS.some((name) => name === buildTool)) {
    throw configError(`"java.buildTool" must be one of: ${JAVA_BUILD_TOOLS.join(', ')}`);
  }
}

export function rejectMissingConfiguredBuild(config: unknown, projectRoot: string): void {
  const tool = optionalText(fieldOf(fieldOf(config, 'java'), BUILD_TOOL));
  const files = BUILD_FILES[tool ?? ''] ?? [];
  if (tool === undefined || files.some((name) => existsSync(pathInside(projectRoot, name) ?? ''))) {
    return;
  }
  const other = JAVA_BUILD_TOOLS.find((name) => name !== tool);
  throw configError(
    `"java.buildTool" is "${tool}", but ${projectRoot} has no ${files.join(' or ')}. ` +
      `Run nitpicker from the project's folder, or set "java.buildTool" to "${String(other)}" or remove it.`,
  );
}
