import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { REPOSITORY_HYGIENE_TOOL } from './files/repository-files.mjs';

const sharedRoot = path.resolve(import.meta.dirname, '..');
const runnerPath = path.join(import.meta.dirname, 'runner.mjs');
const ANALYZER_VERSION = '1';

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return sourceFiles(entryPath);
      }
      return entry.name.endsWith('.mjs') && !entry.name.endsWith('.test.mjs') ? [entryPath] : [];
    })
    .sort();
}

function hashConfiguration() {
  const hash = createHash('sha256');
  for (const file of [...sourceFiles(import.meta.dirname), path.join(sharedRoot, 'glob.mjs')]) {
    hash.update(`${path.relative(sharedRoot, file)}\0`);
    hash.update(readFileSync(file));
  }
  return hash.digest('hex');
}

function createHygieneAnalyzer(name, configurationHash) {
  return {
    name,
    version: ANALYZER_VERSION,
    configurationHash,
    exclusions: [],
    createInvocation({ projectRoot, toolRoot }) {
      return {
        command: process.execPath,
        args: [runnerPath, '--check', name, '--project-root', projectRoot],
        cwd: toolRoot,
      };
    },
  };
}

export function createHygieneAnalyzers() {
  const configurationHash = hashConfiguration();
  return [createHygieneAnalyzer(REPOSITORY_HYGIENE_TOOL, configurationHash)];
}
