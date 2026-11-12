import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { pathInside } from '../../../../shared/filesystem.mjs';

const JVM_SOURCE = /\.(?:java|kt)$/u;
const TEST_SOURCE_SET = /test|^it$/iu;
const TEST_FOLDERS = new Set(['test', 'tests']);

export function isJvmSourcePath(file) {
  return JVM_SOURCE.test(file);
}

function inTestArea(segments) {
  return segments.some(
    (segment, index) =>
      TEST_FOLDERS.has(segment) || (segments[index - 1] === 'src' && TEST_SOURCE_SET.test(segment)),
  );
}

export function isJvmTestPath(file) {
  return isJvmSourcePath(file) && inTestArea(file.split('/').slice(0, -1));
}

export function isJvmProductionPath(file) {
  return isJvmSourcePath(file) && !isJvmTestPath(file);
}

function contentDigest(root, file) {
  const full = pathInside(root, file);
  return full === undefined || !existsSync(full)
    ? 'absent'
    : createHash('sha256').update(readFileSync(full)).digest('hex');
}

export function changedTestsKey({ touchedPaths, headRoot, quick }) {
  const tests = touchedPaths.filter(isJvmTestPath).toSorted();
  if (quick || tests.length === 0) {
    return undefined;
  }
  return JSON.stringify(tests.map((file) => [file, contentDigest(headRoot, file)]));
}
