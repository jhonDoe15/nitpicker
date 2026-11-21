import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { containedPath } from './paths/contained-path.mts';
import { fieldOf, isPlainObject, listOf } from './values/readers.mts';

function insideRoot(root: string, relative: string): string {
  return containedPath(path.resolve(root), relative, {
    outside: (outside) => `Legacy inventory ${outside} is outside ${root}`,
  });
}

export const DEFAULT_LEGACY_INVENTORY = 'nitpicker.legacy.json';

type Site = { readonly file: string; readonly rule: string; readonly source: string };
type InventorySite = Site & { readonly count: number };
type Occurrence = { readonly path: string; readonly rule: string; readonly identity: string };
type EnforceableFinding = Occurrence & { readonly classification: string };
type LegacyAnalyzer = {
  readonly configurationHash?: string;
  readonly packageConfigurationHash?: string;
  readonly legacyInventory?: string;
  readonly resolveConfigurationHash?: (projectRoot: string) => string | undefined;
  readonly resolvePackageConfigurationHash?: (projectRoot: string) => string | undefined;
  readonly createInvocation: (...context: never[]) => { readonly args: readonly string[] };
};

function keyOf(item: Site): string {
  return JSON.stringify([item.file, item.rule, item.source]);
}

export function compareSignals<Signal extends Site>(
  actual: readonly Signal[],
  allowed: readonly InventorySite[],
): (Signal & { count: number })[] {
  const counts = new Map<string, Signal & { count: number }>();
  for (const item of actual) {
    const key = keyOf(item);
    const previous = counts.get(key);
    counts.set(key, { ...item, count: (previous?.count ?? 0) + 1 });
  }
  const allowances = new Map(allowed.map((item): [string, number] => [keyOf(item), item.count]));
  return [...counts.entries()]
    .filter(([key, item]) => item.count > (allowances.get(key) ?? 0))
    .map(([, item]) => item);
}

function inventorySite(value: unknown): InventorySite {
  const file = fieldOf(value, 'file');
  const rule = fieldOf(value, 'rule');
  const source = fieldOf(value, 'source');
  if (typeof file !== 'string' || typeof rule !== 'string' || typeof source !== 'string') {
    throw new TypeError('Coding-standard baseline contains an invalid site');
  }
  const count = fieldOf(value, 'count');
  return { file, rule, source, count: typeof count === 'number' ? count : numericAllowance(count) };
}

export function readOptionalInventory(
  root: string,
  relativePath: string,
): { readonly sites: InventorySite[] } {
  const inventoryPath = insideRoot(root, relativePath);
  if (!existsSync(inventoryPath)) {
    return { sites: [] };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(inventoryPath, 'utf8'));
  } catch (error) {
    throw new SyntaxError(`Invalid legacy inventory: ${inventoryPath}`, { cause: error });
  }
  if (!isPlainObject(parsed)) {
    throw new TypeError(`Invalid legacy inventory: ${inventoryPath}`);
  }
  return { sites: listOf(parsed['sites']).map(inventorySite) };
}

export function applyInventoryToFindings<Finding extends EnforceableFinding>(
  findings: readonly Finding[],
  sites: readonly InventorySite[],
): Finding[] {
  const remaining = new Map(sites.map((site) => [siteKey(site), numericAllowance(site.count)]));
  return findings.filter((finding) => {
    if (finding.classification !== 'enforceable') {
      return true;
    }
    const key = siteKey({ file: finding.path, rule: finding.rule, source: finding.identity });
    const allowance = remaining.get(key) ?? 0;
    if (allowance === 0) {
      return true;
    }
    remaining.set(key, allowance - 1);
    return false;
  });
}

export function withLegacyInventory<Analyzer extends LegacyAnalyzer>(
  analyzer: Analyzer,
  legacyInventory: string,
): Analyzer {
  const packageHash = analyzer.packageConfigurationHash ?? analyzer.configurationHash;
  const resolvePackageHash =
    analyzer.legacyInventory === undefined
      ? analyzer.resolveConfigurationHash
      : analyzer.resolvePackageConfigurationHash;
  return {
    ...analyzer,
    packageConfigurationHash: packageHash,
    resolvePackageConfigurationHash: resolvePackageHash,
    legacyInventory,
    createInvocation: (...context: Parameters<Analyzer['createInvocation']>) => {
      const invocation = analyzer.createInvocation(...context);
      return { ...invocation, args: [...invocation.args, '--legacy-inventory', legacyInventory] };
    },
    resolveConfigurationHash: (projectRoot: string) => {
      const inventory = insideRoot(projectRoot, legacyInventory);
      const configurationHash = resolvePackageHash?.(projectRoot) ?? packageHash;
      return existsSync(inventory)
        ? createHash('sha256')
            .update(configurationHash ?? '')
            .update(readFileSync(inventory))
            .digest('hex')
        : configurationHash;
    },
  };
}

export function siteKey(site: unknown): string {
  const file = fieldOf(site, 'file');
  const rule = fieldOf(site, 'rule');
  const source = fieldOf(site, 'source');
  if (typeof file !== 'string' || typeof rule !== 'string' || typeof source !== 'string') {
    throw new TypeError('Coding-standard baseline contains an invalid site');
  }
  return JSON.stringify([file, rule, source]);
}

export function numericAllowance(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new TypeError('Coding-standard baseline counts must be positive integers');
  }
  return value;
}
