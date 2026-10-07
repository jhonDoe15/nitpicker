import { existsSync } from 'node:fs';
import path from 'node:path';
import { TYPESCRIPT_CONFIG_ENVIRONMENT } from './cruise.mjs';

const projectTypeScriptConfig = requiredTypeScriptConfig();

export default {
  forbidden: [],
  required: [],
  options: {
    doNotFollow: {
      path: '(?:^|/)(?:node_modules|dist|build|generated|coverage|reports|target)(?:/|$)',
    },
    tsConfig: { fileName: projectTypeScriptConfig },
    tsPreCompilationDeps: 'specify',
    enhancedResolveOptions: {
      extensions: ['.ts', '.mts', '.js', '.mjs', '.json'],
    },
  },
};

function requiredTypeScriptConfig() {
  const value = process.env[TYPESCRIPT_CONFIG_ENVIRONMENT];
  if (value === undefined || value.length === 0) {
    throw new Error(`${TYPESCRIPT_CONFIG_ENVIRONMENT} is required`);
  }
  const fileName = path.resolve(value);
  if (!existsSync(fileName)) {
    throw new Error(`Dependency-graph TypeScript config is missing: ${fileName}`);
  }
  return fileName;
}
