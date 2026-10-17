import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { importClosure } from '../import-closure.mjs';
import { REPOSITORY_HYGIENE_TOOL } from './files/repository-files.mjs';

const sharedRoot = path.resolve(import.meta.dirname, '..');
const runnerPath = path.join(import.meta.dirname, 'runner.mjs');
const ANALYZER_VERSION = '1';

export function configurationFiles() {
  return [...importClosure([path.relative(sharedRoot, runnerPath)], sharedRoot).keys()].sort();
}

function hashConfiguration() {
  const hash = createHash('sha256');
  for (const file of configurationFiles()) {
    hash.update(`${file}\0`);
    hash.update(readFileSync(path.join(sharedRoot, file)));
  }
  return hash.digest('hex');
}

function createHygieneAnalyzer({ name, configurationHash, entryPath }) {
  return {
    name,
    version: ANALYZER_VERSION,
    configurationHash,
    exclusions: [],
    createInvocation({ projectRoot, toolRoot }) {
      return {
        command: process.execPath,
        args: [entryPath, 'hygiene', '--check', name, '--project-root', projectRoot],
        cwd: toolRoot,
      };
    },
  };
}

export function createHygieneAnalyzers(entryPath) {
  const configurationHash = hashConfiguration();
  return [createHygieneAnalyzer({ name: REPOSITORY_HYGIENE_TOOL, configurationHash, entryPath })];
}
