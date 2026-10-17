import { hasGeneratorMarker } from '../../../shared/conventions/generator-marker.mjs';
import { readProjectFile } from './project-files.mjs';

const GENERATED_NAME = /(?:^|\/)[^/]+_pb2(?:_grpc)?\.pyi?$/u;

export function isGeneratedPython(projectRoot, file) {
  if (GENERATED_NAME.test(file)) {
    return true;
  }
  const text = readProjectFile(projectRoot, file);
  return text !== undefined && hasGeneratorMarker(text);
}
