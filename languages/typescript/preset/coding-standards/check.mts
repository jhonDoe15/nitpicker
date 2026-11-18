import { format as formatOutput } from 'node:util';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ESLint, type Linter } from 'eslint';
import { checkoutModulePath } from '../../../../shared/paths/checkout-module.mjs';
import { fieldOf, listOf, objectOf } from '../../../../shared/values/readers.mts';
import { linterConfigs } from '../eslint-config/typed/config-types.mts';
import { analyzePublicContractUsage } from '../architecture/public-contract-usage.mts';
import { analyzeRuntimeBoundaries } from '../architecture/runtime-dependency-boundaries.mts';
import { analyzeProductionCallbacks } from '../callback-protocols/analyze.mts';
import { readLayout, type ProjectLayout } from '../callback-protocols/typed/project-layout.mts';
import {
  DEFAULT_LEGACY_INVENTORY,
  compareSignals as untypedCompareSignals,
  readOptionalInventory as untypedReadOptionalInventory,
} from '../../../../shared/legacy-inventory.mjs';

type Signal = {
  readonly file: string;
  readonly rule: string;
  readonly source: string;
  readonly message?: string;
  readonly unparsed?: true;
};

type Allowance = Signal & { readonly count: number };

const compareSignals: (actual: readonly Signal[], allowed: readonly Allowance[]) => Allowance[] =
  untypedCompareSignals;

const readOptionalInventory: (
  root: string,
  relativePath: string,
) => { readonly sites: Allowance[] } = untypedReadOptionalInventory;

const projectRoot = path.resolve(import.meta.dirname, '../../../..');
const defaultLegacyInventoryPath = path.join(projectRoot, DEFAULT_LEGACY_INVENTORY);

export { compareSignals };

const sourcePath: (file: string) => string = checkoutModulePath;

async function policyConfig(policyRoot: string): Promise<Linter.Config[]> {
  const loaded: unknown = await import(
    pathToFileURL(
      sourcePath(
        path.join(
          policyRoot,
          'languages/typescript/preset/eslint-config/policies/coding-standards.config.mjs',
        ),
      ),
    ).href
  );
  return linterConfigs(
    listOf(fieldOf(loaded, 'default')).flatMap((entry) => objectOf(entry) ?? []),
  );
}

export async function collectSignals(
  root = projectRoot,
  policyRoot = root,
  layout: ProjectLayout = readLayout(),
): Promise<Signal[]> {
  const eslint = new ESLint({
    cwd: root,
    overrideConfigFile: true,
    overrideConfig: await policyConfig(policyRoot),
    allowInlineConfig: false,
  });
  const files = layout.projectCodeFiles(root);
  if (files.length === 0) return [];
  const results = await eslint.lintFiles([...files]);
  return results.flatMap((result) => resultSignals(root, result));
}

function resultSignals(root: string, result: ESLint.LintResult): Signal[] {
  const file = path.relative(root, result.filePath).replaceAll('\\', '/');
  if (result.fatalErrorCount > 0) return [unparsedSignal(file, result.messages)];
  const lines = readFileSync(result.filePath, 'utf8').split('\n');
  return result.messages.map((message) => messageSignal(file, lines, message));
}

function unparsedSignal(file: string, messages: readonly Linter.LintMessage[]): Signal {
  const reason = messages.find((message) => message.fatal === true)?.message ?? 'parse failed';
  return {
    file,
    rule: 'unparsed-file',
    source: reason,
    message: `coding-standards could not parse ${file} (${reason}), so it did not check this file; the other files were checked.`,
    unparsed: true,
  };
}

function messageSignal(
  file: string,
  lines: readonly string[],
  message: Linter.LintMessage,
): Signal {
  if (!message.ruleId) throw new Error(message.message);
  return {
    file,
    rule: message.ruleId,
    source: messageSource(lines, message),
    message: message.message,
  };
}

function messageSource(lines: readonly string[], message: Linter.LintMessage): string {
  const line = message.line;
  const last = message.endLine ?? line;
  const sourceLines = lines.slice(line - 1, last);
  if (message.endColumn !== undefined && message.endColumn > 0)
    sourceLines[sourceLines.length - 1] = (sourceLines.at(-1) ?? '').slice(
      0,
      message.endColumn - 1,
    );
  sourceLines[0] = (sourceLines[0] ?? '').slice(message.column - 1);
  return sourceLines.join('\n').replace(/\s+/g, ' ').trim();
}

export function readLegacyInventory(inventoryPath = defaultLegacyInventoryPath): {
  readonly sites: Allowance[];
} {
  return readOptionalInventory(path.dirname(inventoryPath), path.basename(inventoryPath));
}

async function check(): Promise<number> {
  const baseline = readLegacyInventory();
  const signals = [...(await collectSignals()), ...collectArchitectureSignals()].filter(
    (signal) => signal.unparsed !== true,
  );
  const regressions = compareSignals(signals, baseline.sites);
  if (regressions.length > 0) {
    for (const item of regressions)
      process.stderr.write(
        formatOutput(item.file, item.rule, item.source, 'count:', item.count) + '\n',
      );
    process.stderr.write(
      formatOutput(
        'Coding standards failed. Fix the new sites; do not expand the legacy allowance.',
      ) + '\n',
    );
    return 1;
  }
  process.stdout.write(formatOutput('Coding standards passed.') + '\n');
  return 0;
}

export function collectArchitectureSignals(
  root = projectRoot,
  layout: ProjectLayout = readLayout(),
): Signal[] {
  const analyzedConfigs = new Set<string>();
  return layout.sourceRoots.flatMap((layoutSourceRoot) =>
    collectRootArchitectureSignals(root, layoutSourceRoot, { layout, analyzedConfigs }),
  );
}

function contractUsage(
  configPath: string,
  analyzedConfigs: Set<string>,
  root: string,
): ReturnType<typeof analyzePublicContractUsage> {
  if (analyzedConfigs.has(configPath)) {
    return [];
  }
  analyzedConfigs.add(configPath);
  return analyzePublicContractUsage(configPath, { displayRoot: root });
}

function collectRootArchitectureSignals(
  root: string,
  layoutSourceRoot: string,
  {
    layout,
    analyzedConfigs,
  }: { readonly layout: ProjectLayout; readonly analyzedConfigs: Set<string> },
): Signal[] {
  const sourceRoot = path.join(root, layoutSourceRoot);
  if (!existsSync(sourceRoot)) return [];
  const configPath = [
    path.join(sourceRoot, 'tsconfig.json'),
    path.join(root, 'tsconfig.json'),
  ].find(existsSync);
  const contracts = (configPath ? contractUsage(configPath, analyzedConfigs, root) : [])
    .map((item) => ({
      file: item.file,
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

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try {
    process.exitCode = await check();
  } catch (error) {
    process.stderr.write(formatOutput(error) + '\n');
    process.exitCode = 2;
  }
}
