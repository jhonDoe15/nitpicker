import { existsSync, readFileSync } from 'node:fs';
import { loadConfigFromFile } from 'vite';
import { configDefaults, defineConfig, mergeConfig } from 'vitest/config';

// Copied into the analyzed project like vitest.quality.config.ts; see the notes there.
const policyFile = process.env.NITPICKER_POLICY;
const policy = policyFile ? JSON.parse(readFileSync(policyFile, 'utf8')) : {};
const sourceRoots: string[] = policy.layout?.sourceRoots ?? ['src'];
const testRoots: string[] = policy.layout?.testRoots ?? ['test', 'tests'];
const exclude: string[] = policy.exclude ?? [];
const codeExtensions = '{ts,tsx,mts,cts,js,jsx,mjs,cjs}';
const testFiles = (root: string) => [
  `${root}/**/*.test.${codeExtensions}`,
  `${root}/**/*.spec.${codeExtensions}`,
];

const PROJECT_CONFIG_NAMES = ['vitest', 'vite'].flatMap((name) =>
  ['ts', 'mts', 'cts', 'js', 'mjs', 'cjs'].map((extension) => `${name}.config.${extension}`),
);
// Looked up when the config is resolved, relative to the directory Vitest runs in.
const findProjectConfig = () => PROJECT_CONFIG_NAMES.find((name) => existsSync(name));

const nitpickerTests = {
  test: {
    include: [...sourceRoots, ...testRoots].flatMap(testFiles),
    exclude: [...configDefaults.exclude, ...exclude],
    testTimeout: 10_000,
  },
};

async function projectConfig() {
  const projectConfigFile = findProjectConfig();
  if (projectConfigFile === undefined) {
    return { test: { environment: 'node' } };
  }
  const loaded = await loadConfigFromFile({ command: 'serve', mode: 'test' }, projectConfigFile);
  return loaded?.config ?? {};
}

// A function config, because top-level await fails when the project's package is CommonJS.
export default defineConfig(async () => {
  const merged = mergeConfig(await projectConfig(), nitpickerTests);
  // Test roots are relative to the project root, whatever `dir` the project sets.
  return { ...merged, test: { ...merged.test, dir: undefined } };
});
