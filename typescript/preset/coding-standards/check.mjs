import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ESLint } from 'eslint';
import { analyzePublicContractUsage } from '../architecture/public-contract-usage.mjs';
import { analyzeRuntimeBoundaries } from '../architecture/runtime-dependency-boundaries.mjs';
import { analyzeProductionCallbacks } from '../callback-protocols/analyze.mjs';

const projectRoot = path.resolve(import.meta.dirname, '../..');
const defaultLegacyInventoryPath = path.join(import.meta.dirname, 'legacy-sites.json');

/** Keep exact legacy sites visible without allowing new sites or duplicate occurrences. */
export function compareSignals(actual, allowed) {
  const counts = new Map();
  for (const item of actual) {
    const key = JSON.stringify([item.file, item.rule, item.source]);
    const previous = counts.get(key);
    counts.set(key, { ...item, count: (previous?.count ?? 0) + 1 });
  }
  const allowances = new Map(
    allowed.map((item) => [JSON.stringify([item.file, item.rule, item.source]), item.count]),
  );
  return [...counts.entries()]
    .filter(([key, item]) => item.count > (allowances.get(key) ?? 0))
    .map(([, item]) => item);
}

export async function collectSignals(root = projectRoot, policyRoot = root) {
  const eslint = new ESLint({
    cwd: root,
    overrideConfigFile: path.join(policyRoot, 'preset/eslint-config/coding-standards.mjs'),
    allowInlineConfig: false,
  });
  const results = await eslint.lintFiles(['src/main/**/*.ts', 'tests/**/*.ts']);
  const signals = [];
  for (const result of results) {
    if (result.fatalErrorCount > 0)
      throw new Error(result.messages.map((item) => item.message).join('\n'));
    const lines = readFileSync(result.filePath, 'utf8').split('\n');
    for (const message of result.messages) {
      if (!message.ruleId) throw new Error(message.message);
      const line = message.line ?? 1;
      const last = message.endLine ?? line;
      const sourceLines = lines.slice(line - 1, last);
      if (message.endColumn)
        sourceLines[sourceLines.length - 1] = sourceLines.at(-1).slice(0, message.endColumn - 1);
      sourceLines[0] = sourceLines[0].slice((message.column ?? 1) - 1);
      signals.push({
        file: path.relative(root, result.filePath).replaceAll('\\', '/'),
        rule: message.ruleId,
        source: sourceLines.join('\n').replace(/\s+/g, ' ').trim(),
      });
    }
  }
  return signals;
}

/** A missing inventory file means no legacy sites are allowed. */
export function readLegacyInventory(inventoryPath = defaultLegacyInventoryPath) {
  let contents;
  try {
    contents = readFileSync(inventoryPath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return { sites: [] };
    throw error;
  }
  return JSON.parse(contents);
}

export async function check() {
  const baseline = readLegacyInventory();
  const signals = [...(await collectSignals()), ...collectArchitectureSignals()];
  const regressions = compareSignals(signals, baseline.sites);
  if (regressions.length > 0) {
    for (const item of regressions)
      console.error(item.file, item.rule, item.source, 'count:', item.count);
    console.error(
      'Coding standards failed. Fix the new sites; do not expand the legacy allowance.',
    );
    return 1;
  }
  console.log('Coding standards passed.');
  return 0;
}

export function collectArchitectureSignals(root = projectRoot) {
  const sourceRoot = path.join(root, 'src/main');
  const contracts = analyzePublicContractUsage(path.join(sourceRoot, 'tsconfig.json')).map(
    (item) => ({
      file: `src/main/${item.file}`,
      rule: 'public-contract-production-use',
      source: `${item.contract}.${item.method}`,
    }),
  );
  const boundaries = analyzeRuntimeBoundaries(sourceRoot).findings.map((item) => ({
    file: `src/main/${item.source}`,
    rule: `runtime-boundary/${item.rule}`,
    source: `${item.role}:${item.target}`,
  }));
  const callbacks = analyzeProductionCallbacks({ sourceRoot }).findings.map((item) => ({
    file: path.relative(root, item.file).replaceAll('\\', '/'),
    rule: `callback-protocol/${item.rule}`,
    source: item.callee,
  }));
  return [...contracts, ...boundaries, ...callbacks];
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    process.exitCode = await check();
  } catch (error) {
    console.error(error);
    process.exitCode = 2;
  }
}
