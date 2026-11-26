import type { Environment } from '../../../../../shared/processes/environment.mts';
import { loggerShapes as untypedLoggerShapes } from '../../libraries/project-libraries.mts';
import type { LibraryChoices } from '../rules/typed/policy-views.mts';
import { fileLibraries } from './project-libraries-fact.mts';

const loggerShapes: (libraries: LibraryChoices | undefined) => string[] = untypedLoggerShapes;

export function loggerShapesFact(
  filename: string,
  project: { readonly root: string; readonly environment: Environment },
): string {
  return loggerShapes(fileLibraries(filename, project)).join(',');
}
