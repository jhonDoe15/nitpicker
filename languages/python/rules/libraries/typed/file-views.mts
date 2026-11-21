import { projectFilePaths as untypedProjectFilePaths } from '../../../../../shared/project-files/project-files.mts';

type SkipOptions = {
  skipDirectory: (directory: string, entry: { name: string }) => boolean;
};

export const projectFilePaths: (root: string, options: SkipOptions) => string[] =
  untypedProjectFilePaths;
