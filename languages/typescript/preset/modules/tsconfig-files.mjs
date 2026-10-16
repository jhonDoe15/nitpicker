import { createRequire } from 'node:module';
import path from 'node:path';

export const PROJECT_TSCONFIG = 'tsconfig.json';

export function readJsonc(file) {
  const typescript = createRequire(import.meta.url)('typescript');
  const { config } = typescript.readConfigFile(file, typescript.sys.readFile);
  return config;
}

export function referencedConfigFile(projectDirectory, reference) {
  const target = path.resolve(projectDirectory, reference.path);
  return path.extname(target) === '.json' ? target : path.join(target, PROJECT_TSCONFIG);
}

export function isSolutionTsconfig(config) {
  return (
    Array.isArray(config?.references) &&
    config.references.length > 0 &&
    config.compilerOptions === undefined &&
    config.include === undefined &&
    (config.files ?? []).length === 0
  );
}
