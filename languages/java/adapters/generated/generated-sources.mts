import { existsSync } from 'node:fs';
import { resolveInside as untypedResolveInside } from '../../../../shared/conventions/read-inside.mts';
import {
  hasGeneratorAnnotation as untypedHasGeneratorAnnotation,
  hasGeneratorHeader as untypedHasGeneratorHeader,
  hasGeneratorMarker as untypedHasGeneratorMarker,
  readFileHead as untypedReadFileHead,
} from '../../../../shared/conventions/generated/generator-marker.mts';
import ROOT_RULES from '../../gradle/generated/generated-roots.json' with { type: 'json' };

import { configuredGeneratedDirectories, isConfiguredGenerated } from './generator-configs.mts';

const resolveInside: (root: string, file: string) => string | undefined = untypedResolveInside;
const hasGeneratorAnnotation: (text: string) => boolean = untypedHasGeneratorAnnotation;
const hasGeneratorHeader: (text: string) => boolean = untypedHasGeneratorHeader;
const hasGeneratorMarker: (text: string) => boolean = untypedHasGeneratorMarker;
const readFileHead: (file: string) => string = untypedReadFileHead;

const SOURCE_FILE = /\.(?:java|kt)$/u;
const BUILD_OUTPUT = new RegExp(ROOT_RULES.buildOutput, 'u');
const GENERATED_LOOKING =
  /(?:^|\/)(?:generated|generated-sources|generated-test-sources|gen)\/|(?:^|\/)src\/[^/]+\/generated\//u;

function hasMarkedHead(text: string, file: string): boolean {
  return (
    hasGeneratorHeader(text) ||
    hasGeneratorAnnotation(text) ||
    (GENERATED_LOOKING.test(file) && hasGeneratorMarker(text))
  );
}

function isGeneratedWithConfigured(
  projectRoot: string,
  file: string,
  configured: readonly string[],
): boolean {
  if (!SOURCE_FILE.test(file)) {
    return false;
  }
  if (BUILD_OUTPUT.test(file) || isConfiguredGenerated(projectRoot, file, configured)) {
    return true;
  }
  const absolute = resolveInside(projectRoot, file);
  return (
    absolute !== undefined && existsSync(absolute) && hasMarkedHead(readFileHead(absolute), file)
  );
}

export function isGeneratedJvm(projectRoot: string, file: string): boolean {
  return isGeneratedWithConfigured(projectRoot, file, configuredGeneratedDirectories(projectRoot));
}

export function generatedDirectoryGlobs(projectRoot: string): string[] {
  return configuredGeneratedDirectories(projectRoot).map((prefix) => `${prefix}**`);
}

export function withoutGeneratedSources<Finding extends { readonly path: string }>(
  findings: readonly Finding[],
  projectRoot: string,
): Finding[] {
  const configured = configuredGeneratedDirectories(projectRoot);
  const known = new Map<string, boolean>();
  function generated(file: string): boolean {
    let result = known.get(file);
    if (result === undefined) {
      result = isGeneratedWithConfigured(projectRoot, file, configured);
      known.set(file, result);
    }
    return result;
  }
  return findings.filter((finding) => !generated(finding.path));
}
