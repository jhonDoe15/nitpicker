import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execute } from '../adapters/execution/python-process.mjs';

export const FACTS_SCRIPT = fileURLToPath(new URL('test_facts.py', import.meta.url));
const FACTS_PREFIX = 'NITPICKER_FACTS ';

export function isFile(root, relative) {
  const base = path.resolve(root);
  const full = path.resolve(base, relative);
  if (!full.startsWith(base + path.sep)) {
    return false;
  }
  return existsSync(full);
}

function factsLine(stdout) {
  return String(stdout ?? '')
    .split(/\r?\n/u)
    .reverse()
    .find((line) => line.startsWith(FACTS_PREFIX));
}

function parsedFacts(line) {
  try {
    return { facts: JSON.parse(line.slice(FACTS_PREFIX.length)) };
  } catch {
    return { facts: {}, error: 'it printed facts that are not JSON' };
  }
}

export function factsOf(context, root, files) {
  const present = files.filter((file) => isFile(root, file));
  if (present.length === 0) {
    return { facts: {} };
  }
  const result = execute(context, ['python', '-I', FACTS_SCRIPT, root, ...present]);
  const line = factsLine(result.stdout);
  if (result.error !== undefined) {
    return { facts: {}, error: `it could not run: ${result.error.message}` };
  }
  if (result.status !== 0 || line === undefined) {
    return { facts: {}, error: `it exited ${String(result.status)} and printed no facts` };
  }
  return parsedFacts(line);
}

function textOf(root, file) {
  if (root === undefined || !isFile(root, file)) {
    return undefined;
  }
  return readFileSync(path.resolve(root, file), 'utf8');
}

export function isChanged({ test, head, base, roots }) {
  if (roots.baselineRoot === undefined) {
    return true;
  }
  const before = base.facts[test.file];
  if (before === undefined || before === null) {
    return true;
  }
  const current = head.facts[test.file]?.[test.qualname];
  return current === undefined
    ? textOf(roots.projectRoot, test.file) !== textOf(roots.baselineRoot, test.file)
    : before[test.qualname]?.hash !== current.hash;
}
