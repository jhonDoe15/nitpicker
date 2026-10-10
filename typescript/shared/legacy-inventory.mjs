// The legacy inventory (`nitpicker.legacy.json`): existing sites a project allows so adopting the
// gate does not mean fixing everything first. A site is `{ file, rule, source, count }`; the count
// is how many occurrences of that exact site are allowed. New or additional occurrences still
// fail, and raising an allowance on head fails as `baseline-expansion`.
//
// Language-neutral: each language decides what a site's `source` is (the TypeScript
// coding-standards check uses the offending code, the Java preset uses the finding identity).
// No imports from `preset/`, `adapters/` or tool packages.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { numericAllowance, siteKey } from './rules/baseline-expansion.mjs';

/** Where a consumer project records existing violations, relative to its root. */
export const DEFAULT_LEGACY_INVENTORY = 'nitpicker.legacy.json';

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

/** A missing inventory file means no legacy sites are allowed. */
export function readOptionalInventory(root, relativePath) {
  const inventoryPath = path.join(root, relativePath);
  if (!existsSync(inventoryPath)) {
    return { sites: [] };
  }
  try {
    return JSON.parse(readFileSync(inventoryPath, 'utf8'));
  } catch (error) {
    throw new SyntaxError(`Invalid legacy inventory: ${inventoryPath}`, { cause: error });
  }
}

/**
 * Drops the findings the inventory allows: for each site (path, rule, identity) up to `count`
 * occurrences are baselined, any further occurrence stays. Only enforceable findings can be
 * baselined; report-only metrics pass through untouched.
 */
export function applyInventoryToFindings(findings, sites) {
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

/**
 * Points an analyzer at the project's legacy inventory: passes `--legacy-inventory <path>` to its
 * runner and folds the inventory file into its configuration hash, so editing the inventory
 * invalidates cached findings.
 */
export function withLegacyInventory(analyzer, legacyInventory) {
  const packageHash = analyzer.packageConfigurationHash ?? analyzer.configurationHash;
  return {
    ...analyzer,
    packageConfigurationHash: packageHash,
    legacyInventory,
    createInvocation: (context) => {
      const invocation = analyzer.createInvocation(context);
      return { ...invocation, args: [...invocation.args, '--legacy-inventory', legacyInventory] };
    },
    resolveConfigurationHash: (projectRoot) => {
      const inventory = path.join(projectRoot, legacyInventory);
      return existsSync(inventory)
        ? createHash('sha256').update(packageHash).update(readFileSync(inventory)).digest('hex')
        : packageHash;
    },
  };
}
