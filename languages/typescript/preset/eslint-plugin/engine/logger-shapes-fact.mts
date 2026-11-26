import type { Environment } from '../../../../../shared/processes/environment.mts';
import { librariesForFile as untypedLibrariesForFile } from '../../libraries/file-libraries.mts';
import { loggerShapes as untypedLoggerShapes } from '../../libraries/project-libraries.mts';
import { readHeadPolicy as untypedReadHeadPolicy } from '../../head-policy.mts';
import type { LibraryChoices, PluginHeadPolicy } from '../rules/typed/policy-views.mts';

const librariesForFile: (
  context: { readonly filename: string; readonly cwd: string },
  libraries: LibraryChoices | undefined,
) => LibraryChoices | undefined = untypedLibrariesForFile;
const readHeadPolicy: (environment: Environment) => PluginHeadPolicy = untypedReadHeadPolicy;
const loggerShapes: (libraries: LibraryChoices | undefined) => string[] = untypedLoggerShapes;

export function loggerShapesFact(
  filename: string,
  { root, environment }: { readonly root: string; readonly environment: Environment },
): string {
  return loggerShapes(
    librariesForFile({ filename, cwd: root }, readHeadPolicy(environment).libraries),
  ).join(',');
}
