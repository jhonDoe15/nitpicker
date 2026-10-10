import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ESLint } from 'eslint';
import { analyzePublicContractUsage } from '../architecture/public-contract-usage.mjs';
import { analyzeRuntimeBoundaries } from '../architecture/runtime-dependency-boundaries.mjs';
import { analyzeProductionCallbacks } from '../callback-protocols/analyze.mjs';
import { readLayout } from '../head-policy.mjs';
import {
  DEFAULT_LEGACY_INVENTORY,
  compareSignals,
  readOptionalInventory,
} from '../../../../shared/legacy-inventory.mjs';

const projectRoot = path.resolve(import.meta.dirname, '../../../..');
const defaultLegacyInventoryPath = path.join(projectRoot, DEFAULT_LEGACY_INVENTORY);

export { compareSignals };

export async function collectSignals(root = projectRoot, policyRoot = root, layout = readLayout()) {
  const eslint = new ESLint({
    cwd: root,
    overrideConfigFile: path.join(
      policyRoot,
      'languages/typescript/preset/eslint-config/coding-standards.mjs',
    ),
    allowInlineConfig: false,
  });
  const files = layout.projectCodeFiles(root);
  if (files.length === 0) return [];
  const results = await eslint.lintFiles(files);
  return results.flatMap((result) => resultSignals(root, result));
}

function resultSignals(root, result) {
  if (result.fatalErrorCount > 0)
    throw new Error(result.messages.map((item) => item.message).join('\n'));
  const lines = readFileSync(result.filePath, 'utf8').split('\n');
  const file = path.relative(root, result.filePath).replaceAll('\\', '/');
  return result.messages.map((message) => messageSignal(file, lines, message));
}

function messageSignal(file, lines, message) {
  if (!message.ruleId) throw new Error(message.message);
  return { file, rule: message.ruleId, source: messageSource(lines, message) };
}

function messageSource(lines, message) {
  const line = message.line ?? 1;
  const last = message.endLine ?? line;
  const sourceLines = lines.slice(line - 1, last);
  if (message.endColumn)
    sourceLines[sourceLines.length - 1] = sourceLines.at(-1).slice(0, message.endColumn - 1);
  sourceLines[0] = sourceLines[0].slice((message.column ?? 1) - 1);
  return sourceLines.join('\n').replace(/\s+/g, ' ').trim();
}

/** A missing inventory file means no legacy sites are allowed. */
export function readLegacyInventory(inventoryPath = defaultLegacyInventoryPath) {
  return readOptionalInventory(path.dirname(inventoryPath), path.basename(inventoryPath));
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

export function collectArchitectureSignals(root = projectRoot, layout = readLayout()) {
  return layout.sourceRoots.flatMap((layoutSourceRoot) =>
    collectRootArchitectureSignals(root, layoutSourceRoot, layout),
  );
}

function collectRootArchitectureSignals(root, layoutSourceRoot, layout) {
  const sourceRoot = path.join(root, layoutSourceRoot);
  if (!existsSync(sourceRoot)) return [];
  const configPath = [
    path.join(sourceRoot, 'tsconfig.json'),
    path.join(root, 'tsconfig.json'),
  ].find(existsSync);
  const contracts = (configPath ? analyzePublicContractUsage(configPath) : [])
    .map((item) => ({
      file: `${layoutSourceRoot}/${item.file}`,
      rule: 'public-contract-production-use',
      source: `${item.contract}.${item.method}`,
    }))
    .filter((item) => !layout.isExcluded(item.file));
  const boundaries = analyzeRuntimeBoundaries(sourceRoot, undefined, {
    layout,
    displayRoot: layoutSourceRoot,
  }).findings.map((item) => ({
    file: `${layoutSourceRoot}/${item.source}`,
    rule: `runtime-boundary/${item.rule}`,
    source: `${item.role}:${item.target}`,
  }));
  const callbacks = analyzeProductionCallbacks({
    sourceRoot,
    displayRoot: layoutSourceRoot,
    layout,
  }).findings.map((item) => ({
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
