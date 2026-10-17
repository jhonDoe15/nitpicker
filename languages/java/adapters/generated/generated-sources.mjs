import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  hasGeneratorAnnotation,
  hasGeneratorHeader,
  hasGeneratorMarker,
  readFileHead,
} from '../../../../shared/conventions/generator-marker.mjs';

const SOURCE_FILE = /\.(?:java|kt)$/u;
const BUILD_OUTPUT =
  /(?:^|\/)(?:build\/generated|target\/generated-(?:test-)?sources|(?:build|target)\/delombok)\//u;
const GENERATED_LOOKING =
  /(?:^|\/)(?:generated|generated-sources|generated-test-sources|gen)\/|(?:^|\/)src\/[^/]+\/generated\//u;

function hasMarkedHead(text, file) {
  return (
    hasGeneratorHeader(text) ||
    hasGeneratorAnnotation(text) ||
    (GENERATED_LOOKING.test(file) && hasGeneratorMarker(text))
  );
}

export function isGeneratedJvm(projectRoot, file) {
  if (!SOURCE_FILE.test(file)) {
    return false;
  }
  if (BUILD_OUTPUT.test(file)) {
    return true;
  }
  const absolute = path.join(projectRoot, file);
  return existsSync(absolute) && hasMarkedHead(readFileHead(absolute), file);
}

export function withoutGeneratedSources(findings, projectRoot) {
  const known = new Map();
  function generated(file) {
    if (!known.has(file)) {
      known.set(file, isGeneratedJvm(projectRoot, file));
    }
    return known.get(file);
  }
  return findings.filter((finding) => !generated(finding.path));
}
