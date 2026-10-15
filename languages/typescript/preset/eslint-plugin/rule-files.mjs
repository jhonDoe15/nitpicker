import { readdirSync } from 'node:fs';
import path from 'node:path';

const pluginDirectory = import.meta.dirname;
const packageRoot = path.resolve(pluginDirectory, '../../../..');

function isRuleSource(entry) {
  return entry.isFile() && entry.name.endsWith('.mjs') && !entry.name.endsWith('.test.mjs');
}

export const pluginRuleFiles = [
  path.join(pluginDirectory, 'index.mjs'),
  ...readdirSync(path.join(pluginDirectory, 'rules'), { withFileTypes: true, recursive: true })
    .filter(isRuleSource)
    .map((entry) => path.join(entry.parentPath, entry.name)),
]
  .map((file) => path.relative(packageRoot, file).split(path.sep).join('/'))
  .sort();
