import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathInside } from '../../../../../shared/filesystem.mjs';
import { SQL_LIBRARIES } from '../../eslint-plugin/rules/security/sql/no-sql-string-building.mjs';
import { codeExtensions } from '../../layout.mjs';
import { nonProductionFolders } from '../../structure/reuse/reuse-paths.mjs';
import { packageMajorOf, readDependencyNames, storyGlobs } from '../scope-support.mjs';

export const SECURITY_RULES = [
  'nitpicker/no-disabled-tls-verification',
  'nitpicker/no-sql-string-building',
  'nitpicker/no-unsafe-deserialization',
  'nitpicker/no-weak-hash',
  'nitpicker/require-http-timeout',
];

const BROWSER_FRAMEWORKS = new Set([
  'react',
  'preact',
  'vue',
  'svelte',
  'solid-js',
  '@angular/core',
]);
const SUPPORT_FOLDERS = [...nonProductionFolders(), 'test-support', '.storybook', 'mocks'];
const SUPPORT_FILES = ['setupTests', 'setup-tests', 'test-setup', 'vitest.setup', 'jest.setup'];
const DEFAULTS_SEARCH = 'defaults\\.timeout|setGlobalDispatcher';
const FIRST_NODE_FETCH_WITHOUT_TIMEOUT = 3;
const MAX_LISTING_BYTES = 16 * 1024 * 1024;
const NOT_ZERO = '(?!0\\b|undefined\\b|null\\b|false\\b)[\\w(]';
const AXIOS_BINDING =
  /(?:import\s+(\w+)\s+from|(?:const|let|var)\s+(\w+)\s*=\s*require\()\s*['"]axios['"]/gu;
const UNDICI_IMPORT = /(?:from\s*|require\(\s*)['"]undici['"]/u;
const GLOBAL_DISPATCHER = /\bsetGlobalDispatcher\s*\(/u;
const DISPATCHER_TIMEOUT = new RegExp(
  `\\b(?:headers|body|connect)Timeout\\s*:\\s*${NOT_ZERO}`,
  'u',
);

export function securitySupportGlobs() {
  return [
    ...SUPPORT_FOLDERS.map((folder) => `**/${folder}/**`),
    ...SUPPORT_FILES.map((name) => `**/${name}.${codeExtensions}`),
    ...storyGlobs,
  ];
}

function filesSettingDefaults(projectRoot) {
  const found = spawnSync(
    'git',
    [
      'grep',
      '--no-index',
      '--exclude-standard',
      '-l',
      '-E',
      '-e',
      DEFAULTS_SEARCH,
      '--',
      '.',
      ':(exclude)**/node_modules/**',
      ':(exclude)node_modules/**',
    ],
    { cwd: projectRoot, encoding: 'utf8', maxBuffer: MAX_LISTING_BYTES },
  );
  return found.status === 0 ? found.stdout.split('\n').filter(Boolean) : [];
}

function setsAxiosDefaults(text) {
  return [...text.matchAll(AXIOS_BINDING)].some((match) => {
    const name = match[1] ?? match[2];
    return new RegExp(`\\b${name}\\.defaults\\.timeout\\s*=\\s*${NOT_ZERO}`, 'u').test(text);
  });
}

function setsDispatcherTimeouts(text) {
  return UNDICI_IMPORT.test(text) && GLOBAL_DISPATCHER.test(text) && DISPATCHER_TIMEOUT.test(text);
}

function projectHttpDefaults(projectRoot, isProductionFile) {
  const texts = filesSettingDefaults(projectRoot)
    .filter((file) => isProductionFile(file))
    .map((file) => pathInside(projectRoot, file))
    .filter((full) => full !== undefined)
    .map((full) => readFileSync(full, 'utf8'));
  return [
    ...(texts.some(setsAxiosDefaults) ? ['axios'] : []),
    ...(texts.some(setsDispatcherTimeouts) ? ['fetch'] : []),
  ];
}

export function securityFactsFor(projectRoot, isProductionFile) {
  const names = readDependencyNames(projectRoot);
  const nodeFetch = names.includes('node-fetch')
    ? packageMajorOf(projectRoot, 'node-fetch')
    : undefined;
  return {
    browser: names.some((name) => BROWSER_FRAMEWORKS.has(name)),
    sqlLibrary: SQL_LIBRARIES.find((name) => names.includes(name)),
    yamlMajor: names.includes('js-yaml') ? packageMajorOf(projectRoot, 'js-yaml') : undefined,
    nodeFetchTimeout: nodeFetch === undefined || nodeFetch < FIRST_NODE_FETCH_WITHOUT_TIMEOUT,
    httpDefaults: projectHttpDefaults(projectRoot, isProductionFile),
  };
}

export function securityRules({ react, security = {} }) {
  const sql = security.sqlLibrary === undefined ? {} : { sqlLibrary: security.sqlLibrary };
  const yaml = security.yamlMajor === undefined ? {} : { yamlMajor: security.yamlMajor };
  return {
    'nitpicker/no-disabled-tls-verification': 'error',
    'nitpicker/no-sql-string-building': ['error', sql],
    'nitpicker/no-unsafe-deserialization': ['error', yaml],
    'nitpicker/no-weak-hash': 'error',
    'nitpicker/require-http-timeout': [
      'error',
      {
        fetch: !(react || security.browser === true),
        nodeFetchTimeout: security.nodeFetchTimeout !== false,
        projectDefaults: security.httpDefaults ?? [],
      },
    ],
  };
}
