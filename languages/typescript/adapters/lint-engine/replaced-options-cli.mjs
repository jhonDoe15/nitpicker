import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { RULE_EXCEPTION_ENTRY } from '../../preset/eslint-config/exceptions.mjs';
import { readLayout } from '../../preset/head-policy.mjs';
import { createQualityChecks } from '../../preset/quality-checks.mjs';
import { layerEntries } from './project-layer.mjs';
import { replacedOptionRules } from './project-rules.mjs';

const packageRoot = path.resolve(import.meta.dirname, '../../../..');

async function replacedRules(projectConfig) {
  const project = await layerEntries(projectConfig);
  const rules = new Set();
  for (const { configRelativePath } of createQualityChecks(readLayout()).eslintChecks) {
    const policy = await import(pathToFileURL(path.join(packageRoot, configRelativePath)).href);
    const entries = policy.default.filter((entry) => entry?.name !== RULE_EXCEPTION_ENTRY);
    for (const rule of replacedOptionRules(entries, project)) {
      rules.add(rule);
    }
  }
  return [...rules].toSorted();
}

try {
  process.stdout.write(JSON.stringify({ rules: await replacedRules(process.argv[2]) }));
} catch (error) {
  process.stdout.write(
    JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
  );
}
