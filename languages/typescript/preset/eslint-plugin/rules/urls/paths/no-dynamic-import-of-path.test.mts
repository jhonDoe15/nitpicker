import { typescriptRuleTester } from '../../../test-support/rule-tester.mts';
import { rule } from './no-dynamic-import-of-path.mts';

const tester = typescriptRuleTester();
const PATH = "import path from 'node:path';\nimport { pathToFileURL } from 'node:url';\n";

const BARE = "import fs from 'node:fs';\n";

function named(code: string) {
  return { code: `${BARE}${code}`, errors: [{ messageId: 'filePath' as const }] };
}

function flagged(code: string) {
  return { code: `${PATH}${code}`, errors: [{ messageId: 'filePath' as const }] };
}

tester.run('no-dynamic-import-of-path', rule, {
  valid: [
    `${PATH}const mod = await import(pathToFileURL(path.resolve(root, configFile)).href);`,
    `${PATH}const mod = await import(pathToFileURL(configPath));`,
    `${PATH}const file = pathToFileURL(path.join(root, 'x.mjs')).href; const mod = await import(file);`,
    "const mod = await import('./plugin.mjs');",
    "const mod = await import('lodash');",
    'const mod = await import(`./locales/${lang}.js`);',
    'const mod = await import(specifier);',
    `${PATH}const mod = await import(new URL('./x.mjs', import.meta.url).href);`,
    `${PATH}const mod = await import(import.meta.resolve('pkg'));`,
    `${PATH}const mod = await import(url.href);`,
    'const mod = await import(modulePath);',
    'async function load(options) { return import(options.pluginPath); }',
    `${PATH}async function load(configPath: string) { return import(pathToFileURL(configPath).href); }`,
    `${PATH}const a = pathToFileURL(x); async function load(configPath: string) { return import(configPath); }`,
    'async function load(configPath: string) { return import(configPath); }',
    `${PATH}const mod = await import(options.loader);`,
    `${PATH}const mod = await import(name);`,
    "import path from 'node:path';\nconst mod = await import(`file:///${path.join(root, 'x.mjs')}`);",
    {
      code: `${PATH}const mod = await import(path.resolve(root, 'x.js'));`,
      filename: 'playground/__test__/serve.ts',
    },
  ],
  invalid: [
    flagged('const mod = await import(path.resolve(root, configFile));'),
    {
      code: `${PATH}const mod = import(path.resolve(root, 'x.js'));\nexport default mod;`,
      errors: [{ messageId: 'filePath' as const }],
    },
    flagged('const mod = await import(path.join(process.cwd(), "plugin.mjs"));'),
    flagged('const mod = await import(require.resolve("pkg/plugin.mjs"));'),
    flagged('const mod = await import(fileURLToPath(new URL("./x.mjs", import.meta.url)));'),
    flagged('const full = path.resolve(root, file); const mod = await import(full);'),
    flagged('const mod = await import(`${process.cwd()}/plugin.mjs`);'),
    flagged('const mod = await import(__dirname + "/plugin.js");'),
    flagged('const mod = await import(`${import.meta.dirname}/plugin.js`);'),
    named('async function load(resolvedPath: string) { return import(resolvedPath); }'),
    named('const entryFile = findEntry(root); const mod = await import(entryFile);'),
    named('const { configPath } = await locate(root); const mod = await import(configPath);'),
    {
      code: "import { resolve } from 'path';\nconst mod = await import(resolve(root, 'x.mjs'));",
      errors: [{ messageId: 'filePath' as const }],
    },
  ],
});
