import { cruise } from 'dependency-cruiser';
import { ESLint } from 'eslint';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import tseslint from 'typescript-eslint';
import { afterAll, describe, expect, it } from 'vitest';
import architectureConfig from '../../preset/defaults/dependency-cruiser.config.mjs';
import { strictSyntaxConfigFor } from '../../preset/eslint-config/strict.mjs';
import { resolveLayout } from '../../preset/layout.mjs';
import { staticChecks } from '../../preset/quality-checks.mjs';

const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-architecture-packages-'));
const domain = 'src/main/features/billing/domain';
const compilerOptions = { module: 'NodeNext', strict: true, types: [], lib: ['ES2022'] };

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

const files = {
  'tsconfig.json': JSON.stringify({ compilerOptions }),
  'package.json': JSON.stringify({
    name: 'app',
    type: 'module',
    dependencies: { react: '19.0.0' },
  }),
  'node_modules/react/package.json': JSON.stringify({ name: 'react', main: 'index.js' }),
  'node_modules/react/index.js': 'exports.useState = () => [];\n',
  'node_modules/pino/package.json': JSON.stringify({ name: 'pino', main: 'pino.js' }),
  'node_modules/pino/pino.js': 'module.exports = () => ({});\n',
  'node_modules/axios/package.json': JSON.stringify({ name: 'axios', main: 'dist/node/axios.cjs' }),
  'node_modules/axios/dist/node/axios.cjs': 'module.exports = {};\n',
  [`${domain}/log.ts`]: "import pino from 'pino';\nexport const log = pino;\n",
  [`${domain}/fetch.ts`]: "import axios from 'axios';\nexport const client = axios;\n",
  [`${domain}/view.ts`]: "import { useState } from 'react';\nexport const view = useState;\n",
  [`${domain}/total.ts`]:
    'export function total(a: number, b: number): number {\n  return a + b;\n}\n',
};

for (const [file, contents] of Object.entries(files)) {
  mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  writeFileSync(path.join(root, file), contents);
}

const architectureCheck = staticChecks.find(({ name }) => name === 'dependency-architecture');

async function architectureViolations() {
  const ruleSet = structuredClone(architectureConfig);
  ruleSet.options.baseDir = root;
  ruleSet.options.tsConfig = { fileName: path.join(root, 'tsconfig.json') };
  const tsConfig = ts.parseJsonConfigFileContent({ compilerOptions }, ts.sys, root);
  const result = await cruise(
    [domain],
    { ruleSet, validate: true, exclude: { path: architectureCheck.exclude } },
    {},
    { tsConfig, babelConfig: {} },
  );
  return result.output.summary.violations
    .map(({ from, rule }) => `${from} ${rule.name}`)
    .toSorted();
}

async function domainSyntaxRules(file) {
  const eslint = new ESLint({
    cwd: root,
    overrideConfigFile: true,
    overrideConfig: [
      { files: ['**/*.ts'], languageOptions: { parser: tseslint.parser } },
      ...strictSyntaxConfigFor(resolveLayout()),
    ],
  });
  const [result] = await eslint.lintFiles([path.join(root, file)]);
  return result.messages.map(({ ruleId }) => ruleId);
}

describe('architecture rules on installed packages', () => {
  it('report domain imports of installed packages, also one whose entry is under dist/', async () => {
    expect(await architectureViolations()).toEqual([
      `${domain}/fetch.ts domain-does-not-import-network-or-database-clients`,
      `${domain}/log.ts domain-does-not-import-the-logger`,
    ]);
  });

  it('report an installed react in domain/', async () => {
    expect(await domainSyntaxRules(`${domain}/view.ts`)).toEqual(['nitpicker/no-ui-framework-in-domain']);
    expect(await domainSyntaxRules(`${domain}/total.ts`)).toEqual([]);
  });
});
