import {
  hasGeneratorHeader,
  hasGeneratorMarker,
} from '../../../shared/conventions/generator-marker.mjs';
import { readProjectFile } from './project-files.mts';

const GENERATED_NAME = /(?:^|\/)[^/]+_pb2(?:_grpc)?\.pyi?$/u;
const GENERATED_LOOKING = /(?:^|\/)(?:generated|_generated|__generated__)\/|_generated\.pyi?$/u;

export function isGeneratedPython(projectRoot: string, file: string): boolean {
  if (GENERATED_NAME.test(file)) {
    return true;
  }
  const text = readProjectFile(projectRoot, file);
  return (
    text !== undefined &&
    ((GENERATED_LOOKING.test(file) && hasGeneratorMarker(text)) || hasGeneratorHeader(text))
  );
}

export function dropGeneratedFindings<Finding extends { rule: string; path: string }>(
  findings: readonly Finding[],
  projectRoot: string,
  rules: readonly string[],
): Finding[] {
  return findings.filter(
    ({ rule, path }) => !(rules.includes(rule) && isGeneratedPython(projectRoot, path)),
  );
}
