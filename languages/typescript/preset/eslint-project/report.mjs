import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { layerEntries } from '../../adapters/lint-engine/project-layer.mjs';
import { replacedOptionRules } from '../../adapters/lint-engine/project-rules.mjs';
import { RULE_EXCEPTION_ENTRY } from '../eslint-config/exceptions.mjs';
import { readLayout } from '../head-policy.mjs';
import { createQualityChecks } from '../quality-checks.mjs';

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

const [projectConfig, reportFile] = process.argv.slice(2);

async function report() {
  try {
    return { rules: await replacedRules(projectConfig) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

writeFileSync(reportFile, JSON.stringify(await report()));
