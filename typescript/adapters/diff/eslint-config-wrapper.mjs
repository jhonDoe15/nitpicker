import path from 'node:path';
import { pathToFileURL } from 'node:url';

const policyConfigPath = requiredEnvironmentPath('QUALITY_DIFF_ESLINT_POLICY_CONFIG');
const projectRoot = requiredEnvironmentPath('QUALITY_DIFF_ESLINT_PROJECT_ROOT');
const projectConfigPath = optionalEnvironmentPath('QUALITY_DIFF_ESLINT_PROJECT_CONFIG');
const policyModule = await import(pathToFileURL(policyConfigPath).href);

if (!Array.isArray(policyModule.default)) {
  throw new TypeError(`ESLint policy ${policyConfigPath} must export a flat configuration array`);
}

export default policyModule.default.map((entry) =>
  rebaseTypeScriptProject(entry, projectRoot, projectConfigPath),
);

function rebaseTypeScriptProject(entry, root, configPath) {
  const parserOptions = entry?.languageOptions?.parserOptions;
  if (parserOptions?.tsconfigRootDir === undefined) {
    return entry;
  }

  return {
    ...entry,
    languageOptions: {
      ...entry.languageOptions,
      parserOptions: {
        ...parserOptions,
        project: parserOptions.project
          ? (configPath ?? parserOptions.project)
          : parserOptions.project,
        tsconfigRootDir: root,
      },
    },
  };
}

function requiredEnvironmentPath(name) {
  const value = process.env[name];
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is required`);
  }
  return path.resolve(value);
}

function optionalEnvironmentPath(name) {
  const value = process.env[name];
  return value === undefined || value.length === 0 ? undefined : path.resolve(value);
}
