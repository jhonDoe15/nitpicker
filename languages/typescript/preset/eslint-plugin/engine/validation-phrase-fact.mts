import type { Environment } from '../../../../../shared/processes/environment.mts';
import { librariesForFile as untypedLibrariesForFile } from '../../libraries/file-libraries.mts';
import { validationBehavior as untypedValidationBehavior } from '../../libraries/project-libraries.mts';
import { readHeadPolicy as untypedReadHeadPolicy } from '../../head-policy.mts';
import type { LibraryChoices, PluginHeadPolicy } from '../rules/typed/policy-views.mts';

const librariesForFile: (
  context: { readonly filename: string; readonly cwd: string },
  libraries: LibraryChoices | undefined,
) => LibraryChoices | undefined = untypedLibrariesForFile;
const readHeadPolicy: (environment: Environment) => PluginHeadPolicy = untypedReadHeadPolicy;
const validationBehavior: (libraries: LibraryChoices | undefined) => { readonly phrase: string } =
  untypedValidationBehavior;

const policies = new WeakMap<Environment, LibraryChoices | undefined>();

function policyLibraries(environment: Environment): LibraryChoices | undefined {
  if (!policies.has(environment)) {
    policies.set(environment, readHeadPolicy(environment).libraries);
  }
  return policies.get(environment);
}

export function validationPhraseFact(
  filename: string,
  { root, environment }: { readonly root: string; readonly environment: Environment },
): string {
  return validationBehavior(librariesForFile({ filename, cwd: root }, policyLibraries(environment)))
    .phrase;
}
