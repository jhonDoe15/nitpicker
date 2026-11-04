import {
  hasGeneratorHeader,
  hasGeneratorMarker,
} from '../../../shared/conventions/generator-marker.mjs';
import { readProjectFile } from './project-files.mjs';

const GENERATED_NAME = /(?:^|\/)[^/]+_pb2(?:_grpc)?\.pyi?$/u;
const GENERATED_LOOKING = /(?:^|\/)(?:generated|_generated|__generated__)\/|_generated\.pyi?$/u;

export function isGeneratedPython(projectRoot, file) {
  if (GENERATED_NAME.test(file)) {
    return true;
  }
  const text = readProjectFile(projectRoot, file);
  return (
    text !== undefined &&
    ((GENERATED_LOOKING.test(file) && hasGeneratorMarker(text)) || hasGeneratorHeader(text))
  );
}

export function dropGeneratedFindings(findings, projectRoot, rules) {
  return findings.filter(
    ({ rule, path }) => !rules.includes(rule) || !isGeneratedPython(projectRoot, path),
  );
}
