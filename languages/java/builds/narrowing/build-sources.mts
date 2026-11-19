import { readInside } from '../../../../shared/conventions/read-inside.mjs';
import { optionalText } from '../../../../shared/values/readers.mts';
import { callUntyped } from '../../adapters/typed/java-values.mts';
import type { SourceEntry } from '../typed/narrowing-types.mts';
import { readGradleSources } from './gradle-sources.mts';
import { readMavenSources } from './maven-sources.mts';

function readText(projectRoot: string, file: string): string | undefined {
  return optionalText(callUntyped(readInside, projectRoot, file, 'utf8'));
}

export function readBuildSources(projectRoot: string, files: readonly string[]): SourceEntry[] {
  return [
    ...readGradleSources(files, (file) => readText(projectRoot, file)),
    ...readMavenSources(files, (file) => readText(projectRoot, file)),
  ];
}
