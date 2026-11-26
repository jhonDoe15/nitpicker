import type { Environment } from '../../../../../shared/processes/environment.mts';
import { memoized } from '../../../../../shared/values/caching/memoized.mts';
import { librariesForFile as untypedLibrariesForFile } from '../../libraries/file-libraries.mts';
import { readHeadPolicy as untypedReadHeadPolicy } from '../../head-policy.mts';
import type { LibraryChoices, PluginHeadPolicy } from '../rules/typed/policy-views.mts';

const librariesForFile: (
  context: { readonly filename: string; readonly cwd: string },
  libraries: LibraryChoices | undefined,
) => LibraryChoices | undefined = untypedLibrariesForFile;
const readHeadPolicy: (environment: Environment) => PluginHeadPolicy = untypedReadHeadPolicy;

const policyLibraries = memoized(
  (environment: Environment): LibraryChoices | undefined => readHeadPolicy(environment).libraries,
);

export function fileLibraries(
  filename: string,
  { root, environment }: { readonly root: string; readonly environment: Environment },
): LibraryChoices | undefined {
  return librariesForFile({ filename, cwd: root }, policyLibraries(environment));
}
