import type { Environment } from '../../../../../shared/processes/environment.mts';
import { validationBehavior as untypedValidationBehavior } from '../../libraries/project-libraries.mts';
import type { LibraryChoices } from '../rules/typed/policy-views.mts';
import { fileLibraries } from './project-libraries-fact.mts';

const validationBehavior: (libraries: LibraryChoices | undefined) => { readonly phrase: string } =
  untypedValidationBehavior;

export function validationPhraseFact(
  filename: string,
  project: { readonly root: string; readonly environment: Environment },
): string {
  return validationBehavior(fileLibraries(filename, project)).phrase;
}
