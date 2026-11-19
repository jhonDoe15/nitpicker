import { existsSync } from 'node:fs';
import { resolveInside as untypedResolveInside } from '../../../../shared/conventions/read-inside.mjs';
import {
  hasGeneratorAnnotation as untypedHasGeneratorAnnotation,
  hasGeneratorHeader as untypedHasGeneratorHeader,
  hasGeneratorMarker as untypedHasGeneratorMarker,
  readFileHead as untypedReadFileHead,
} from '../../../../shared/conventions/generator-marker.mjs';

const resolveInside: (root: string, file: string) => string | undefined = untypedResolveInside;
const hasGeneratorAnnotation: (text: string) => boolean = untypedHasGeneratorAnnotation;
const hasGeneratorHeader: (text: string) => boolean = untypedHasGeneratorHeader;
const hasGeneratorMarker: (text: string) => boolean = untypedHasGeneratorMarker;
const readFileHead: (file: string) => string = untypedReadFileHead;

const SOURCE_FILE = /\.(?:java|kt)$/u;
const BUILD_OUTPUT =
  /(?:^|\/)(?:build\/generated|target\/generated-(?:test-)?sources|(?:build|target)\/delombok)\//u;
const GENERATED_LOOKING =
  /(?:^|\/)(?:generated|generated-sources|generated-test-sources|gen)\/|(?:^|\/)src\/[^/]+\/generated\//u;

function hasMarkedHead(text: string, file: string): boolean {
  return (
    hasGeneratorHeader(text) ||
    hasGeneratorAnnotation(text) ||
    (GENERATED_LOOKING.test(file) && hasGeneratorMarker(text))
  );
}

export function isGeneratedJvm(projectRoot: string, file: string): boolean {
  if (!SOURCE_FILE.test(file)) {
    return false;
  }
  if (BUILD_OUTPUT.test(file)) {
    return true;
  }
  const absolute = resolveInside(projectRoot, file);
  return (
    absolute !== undefined && existsSync(absolute) && hasMarkedHead(readFileHead(absolute), file)
  );
}

export function withoutGeneratedSources<Finding extends { readonly path: string }>(
  findings: readonly Finding[],
  projectRoot: string,
): Finding[] {
  const known = new Map<string, boolean>();
  function generated(file: string): boolean {
    let result = known.get(file);
    if (result === undefined) {
      result = isGeneratedJvm(projectRoot, file);
      known.set(file, result);
    }
    return result;
  }
  return findings.filter((finding) => !generated(finding.path));
}
